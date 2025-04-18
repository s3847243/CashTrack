import * as cdk from 'aws-cdk-lib';
import { SecurityGroup, Subnet, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';
import * as path from "path";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';

export class ExpenseBackendServices extends cdk.Stack {
   
    constructor(scope: Construct, id: string, props?: cdk.StackProps){
        super(scope, id, props);
        
        const vpc = Vpc.fromLookup(this, 'VpcImported', {
            vpcId: cdk.aws_ssm.StringParameter.valueFromLookup(this, 'VpcId')
        });

        const privateHostedZone = new route53.PrivateHostedZone(this, 'PrivateHostedZone', {
            zoneName: 'public',
            vpc: vpc
        });
        
        const privateSubnet1 = Subnet.fromSubnetId(this, 'PrivateSubnet1', cdk.aws_ssm.StringParameter.valueFromLookup(this, 'PrivateSubnet-0'));
        const privateSubnet2 = Subnet.fromSubnetId(this, 'PrivateSubnet2', cdk.aws_ssm.StringParameter.valueFromLookup(this, 'PrivateSubnet-1'));
        const publicSubnet1 = Subnet.fromSubnetId(this, 'PublicSubnet1', cdk.aws_ssm.StringParameter.valueFromLookup(this, 'PublicSubnet-0'));
        const publicSubnet2 = Subnet.fromSubnetId(this, 'PublicSubnet2', cdk.aws_ssm.StringParameter.valueFromLookup(this, 'PublicSubnet-1'));

        const nlbDnsName = cdk.aws_ssm.StringParameter.valueFromLookup(this, "ExpenseTrackerServicesNLB");

        const servicesSecurityGroup = new SecurityGroup(this, 'BackendServicesSecurityGroup', {
            vpc,
            allowAllOutbound: true
        });
        
        // Add these rules to your servicesSecurityGroup
        servicesSecurityGroup.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(9092),
            'Allow Kafka traffic'
        );

        servicesSecurityGroup.addEgressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(9092),
            'Allow outbound Kafka traffic'
        );
        
        servicesSecurityGroup.addEgressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(443),
            'Allow HTTPS outbound traffic for Mistral AI API'
        );

        const authServiceImage = new assets.DockerImageAsset(this, 'AuthServiceImage', {
            directory: path.join(__dirname, '..', '..', '', 'AuthService1'),
        });

        const userServiceImage = new assets.DockerImageAsset(this, 'userServiceImage', {
            directory: path.join(__dirname, '..', '..',  'userservice'),
        });

        const expenseServiceImage = new assets.DockerImageAsset(this, 'expenseServiceImage', {
            directory: path.join(__dirname, '..', '..', 'expenseService') 
        });

        const dsServiceImage = new assets.DockerImageAsset(this, 'dsServiceImage', {
            directory: path.join(__dirname, '..', '..', 'dsService'), 
            platform: assets.Platform.LINUX_AMD64, 
            buildArgs: {
            BUILDKIT_INLINE_CACHE: "1"
            },
            invalidation: {
                buildArgs: true,
            },
            file: 'Dockerfile'
        });

        const kongServiceImage = new assets.DockerImageAsset(this, "KongServiceImage", {
            directory: path.join(__dirname, "..", "..", "expenseTrackerAppDeps", "kong"),
            platform: assets.Platform.LINUX_AMD64,
            buildArgs: {
                BUILDKIT_INLINE_CACHE: "1"
            },
            invalidation: {
                buildArgs: true,
            },
            file: 'Dockerfile'
        });

        const cluster = new ecs.Cluster(this, 'ExpenseBackendCluster', {
            vpc: vpc
        })

        const kongServiceTaskDef = new ecs.FargateTaskDefinition(this, 'KongServiceTaskDef', {
            memoryLimitMiB: 512,
            cpu: 256
        });

        const authServiceTaskDef = new ecs.FargateTaskDefinition(this, 'AuthServiceTaskDef', {
            memoryLimitMiB: 1024,
            cpu: 512,
        });

        const userServiceTaskDef = new ecs.FargateTaskDefinition(this, 'UserServiceTaskDef', {
            memoryLimitMiB: 1024,
            cpu: 512
        });

        const expenseServiceTaskDef = new ecs.FargateTaskDefinition(this, 'ExpenseServiceTaskDef', {
            memoryLimitMiB: 512,
            cpu: 256
        });

        const dsServiceTaskDef = new ecs.FargateTaskDefinition(this, 'DsServiceTaskDef', {
            memoryLimitMiB: 512,
            cpu: 256
        });

        authServiceTaskDef.addContainer('AuthServiceContainer', {
            image: ecs.ContainerImage.fromDockerImageAsset(authServiceImage),
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: "AuthService",
                logRetention: RetentionDays.ONE_WEEK 
            }),
            environment: {
                MYSQL_HOST: nlbDnsName,
                MYSQL_PORT: '3306',
                MYSQL_DB: 'authservice',
                MYSQL_USER: 'user',
                MYSQL_PASSWORD: 'password',
                KAFKA_HOST: nlbDnsName,
                KAFKA_PORT: '9092'
            },
            portMappings: [{containerPort: 9898}],
        });

        kongServiceTaskDef.addContainer('KongServiceContainer', {
            image: ecs.ContainerImage.fromDockerImageAsset(kongServiceImage),
            logging: ecs.LogDriver.awsLogs({
                streamPrefix: "KongService",
                logRetention: RetentionDays.ONE_WEEK
            }),
            portMappings: [
                { containerPort: 8000 }, // Kong proxy port
                { containerPort: 8001 }  // Kong admin API port
            ]
        });

        userServiceTaskDef.addContainer('UserServiceContainer', {
            image: ecs.ContainerImage.fromDockerImageAsset(userServiceImage),
            logging: ecs.LogDriver.awsLogs({
                streamPrefix: "UserService",
                logRetention: RetentionDays.ONE_DAY
            }),
            environment: {
                MYSQL_HOST: nlbDnsName,
                MYSQL_PORT: '3306',
                MYSQL_DB: 'userservice',
                MYSQL_USER: 'user',
                MYSQL_PASSWORD: 'password',
                KAFKA_HOST: nlbDnsName,
                KAFKA_PORT: '9092'
            },
            portMappings: [{containerPort: 9810}]
        });

        expenseServiceTaskDef.addContainer('ExpenseServiceContainer', {
            image: ecs.ContainerImage.fromDockerImageAsset(expenseServiceImage),
            logging: ecs.LogDriver.awsLogs({
                streamPrefix: "ExpenseService",
                logRetention: RetentionDays.ONE_DAY
            }),
            environment: {
                MYSQL_HOST: nlbDnsName,
                MYSQL_PORT: '3306',
                MYSQL_DB: 'expenseservice',
                MYSQL_USER: 'user',
                MYSQL_PASSWORD: 'password',
                KAFKA_HOST: nlbDnsName,
                KAFKA_PORT: '9092'
            },
            portMappings: [{containerPort: 9820}]
        });

        dsServiceTaskDef.addContainer('DsServiceContainer', {
            image: ecs.ContainerImage.fromDockerImageAsset(dsServiceImage),
            logging: ecs.LogDriver.awsLogs({
                streamPrefix: "DsService",
                logRetention: RetentionDays.ONE_DAY
            }),
            environment: {
                KAFKA_HOST: nlbDnsName,
                KAFKA_PORT: '9092',
                OPENAI_API_KEY: process.env.OPEN_AI_KEY || ''
            },
            portMappings: [{containerPort: 8010}]
        });

        const kongSecurityGroup = new SecurityGroup(this, "KongSecurityGroup", {
            vpc,
            allowAllOutbound: true,
            description: "Security Group for Kong"
         });
        
        const authFargateService = new ecs.FargateService(this, 'AuthService', {
            cluster: cluster,
            taskDefinition: authServiceTaskDef,
            desiredCount: 1,
            securityGroups: [servicesSecurityGroup],
            vpcSubnets: {subnets: [privateSubnet1, privateSubnet2]},
            assignPublicIp: false,
            enableExecuteCommand: true,
        });

        const userFargateService = new ecs.FargateService(this, "UserFargateService", {
            cluster: cluster, 
            taskDefinition: userServiceTaskDef,
            desiredCount: 1,
            vpcSubnets: {subnets: [privateSubnet1, privateSubnet2]},
            securityGroups: [servicesSecurityGroup],
            assignPublicIp: false,
            enableExecuteCommand: true,
        });

        const expenseFargateService = new ecs.FargateService(this, "ExpenseFargateService", {
            cluster: cluster, 
            taskDefinition: expenseServiceTaskDef,
            desiredCount: 1,
            vpcSubnets: {subnets: [privateSubnet1, privateSubnet2]},
            securityGroups: [servicesSecurityGroup],
            assignPublicIp: false,
            enableExecuteCommand: true,
        });

        const dsFargateService = new ecs.FargateService(this, "DsFargateService", {
            cluster: cluster, 
            taskDefinition: dsServiceTaskDef,
            desiredCount: 1,
            vpcSubnets: {subnets: [privateSubnet1, privateSubnet2]},
            securityGroups: [servicesSecurityGroup],
            assignPublicIp: false,
            enableExecuteCommand: true,
        });

        const authServiceAlb = new elbv2.ApplicationLoadBalancer(this, 'AuthServiceALB', {
            vpc,
            internetFacing: false,
            vpcSubnets: {subnets: [privateSubnet1, privateSubnet2]}
        });

        const userServiceAlb = new elbv2.ApplicationLoadBalancer(this, 'UserServiceALB', {
            vpc,
            internetFacing: false,
            vpcSubnets: {subnets: [privateSubnet1, privateSubnet2]}
        });

        const expenseServiceAlb = new elbv2.ApplicationLoadBalancer(this, 'ExpenseServiceALB', {
            vpc,
            internetFacing: false,
            vpcSubnets: {subnets: [privateSubnet1, privateSubnet2]}
        });
        
        const dsServiceAlb = new elbv2.ApplicationLoadBalancer(this, 'DsServiceALB', {
            vpc,
            internetFacing: false,
            vpcSubnets: {subnets: [privateSubnet1, privateSubnet2]}
        });

        const authServiceTargetGroup = new elbv2.ApplicationTargetGroup(this, 'AuthServiceTargetGroup', {
            vpc,
            port: 9898,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/health',
                interval: cdk.Duration.seconds(60),
                timeout: cdk.Duration.seconds(30),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                healthyHttpCodes: '200-299'
            }
        });

        const userServiceTargetGroup = new elbv2.ApplicationTargetGroup(this, 'UserServiceTargetGroup',{
            vpc,
            port: 9810,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/health',
                interval: cdk.Duration.seconds(60),
                timeout: cdk.Duration.seconds(30),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                healthyHttpCodes: '200-299'
            }
        })

        const expenseServiceTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ExpenseServiceTargetGroup',{
            vpc,
            port: 9820,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/expense/v1/health',
                interval: cdk.Duration.seconds(60),
                timeout: cdk.Duration.seconds(30),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                healthyHttpCodes: '200-299'
            }
        });

        const dsServiceTargetGroup = new elbv2.ApplicationTargetGroup(this, 'DsServiceTargetGroup',{
            vpc,
            port: 8010,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/health',
                interval: cdk.Duration.seconds(60),
                timeout: cdk.Duration.seconds(30),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                healthyHttpCodes: '200-299'
            }
        });

        authServiceTargetGroup.addTarget(authFargateService);
        userServiceTargetGroup.addTarget(userFargateService);
        expenseServiceTargetGroup.addTarget(expenseFargateService);
        dsServiceTargetGroup.addTarget(dsFargateService);

        authServiceAlb.addListener('AuthServiceListener', {
            port: 80,
            defaultTargetGroups: [authServiceTargetGroup]
        });
        userServiceAlb.addListener('UserServiceAlbListener', {
            port: 80, 
            defaultTargetGroups: [userServiceTargetGroup]
        });
        expenseServiceAlb.addListener('ExpenseServiceAlbListener', {
            port: 80, 
            defaultTargetGroups: [expenseServiceTargetGroup]
        });
        dsServiceAlb.addListener('DsServiceAlbListener', {
            port: 80, 
            defaultTargetGroups: [dsServiceTargetGroup]
        });

        new route53.ARecord(this, 'AuthServiceAlbDnsRecord', {
            zone: privateHostedZone,
            recordName: 'auth-service-alb',
            target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(authServiceAlb))
        });
        
        new route53.ARecord(this, 'UserServiceAlbDnsRecord', {
            zone: privateHostedZone,
            recordName: 'user-service-alb',
            target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(userServiceAlb))
        });
        
        new route53.ARecord(this, 'ExpenseServiceAlbDnsRecord', {
            zone: privateHostedZone,
            recordName: 'expense-service-alb',
            target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(expenseServiceAlb))
        });
        
        new route53.ARecord(this, 'DsServiceAlbDnsRecord', {
            zone: privateHostedZone,
            recordName: 'ds-service-alb',
            target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(dsServiceAlb))
        });

        // Remove direct service port egress rules and keep only ALB access
        kongSecurityGroup.addEgressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(80),
            'Allow Kong to access Service ALBs'
        );

        // Allow ALB connections from Kong
        authServiceAlb.connections.allowFrom(
            kongSecurityGroup,
            ec2.Port.tcp(80),
            'Allow traffic from Kong to Auth Service ALB'
        );
        userServiceAlb.connections.allowFrom(
            kongSecurityGroup,
            ec2.Port.tcp(80),
            'Allow traffic from Kong to User Service ALB'
        );
        expenseServiceAlb.connections.allowFrom(
            kongSecurityGroup,
            ec2.Port.tcp(80),
            'Allow traffic from Kong to Expense Service ALB'
        );
        dsServiceAlb.connections.allowFrom(
            kongSecurityGroup,
            ec2.Port.tcp(80),
            'Allow traffic from Kong to DS Service ALB'
        );

        const kongFargateService = new ecs.FargateService(this, 'KongFargateService', {
            cluster: cluster,
            taskDefinition: kongServiceTaskDef,
            desiredCount: 1,
            securityGroups: [kongSecurityGroup],
            vpcSubnets: {
                subnets: [publicSubnet1, publicSubnet2]
            },
            assignPublicIp: true,
        });     

        
        const kongALB = new elbv2.ApplicationLoadBalancer(this, 'KongALB', {
            vpc, 
            internetFacing: true,
            vpcSubnets: {subnets: [publicSubnet1, publicSubnet2]}
        });

        const kongTargetGroup = new elbv2.ApplicationTargetGroup(this, 'KongTargetGroup', {
            vpc,
            port: 8000,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/status',
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                healthyHttpCodes: "200-299"
            }
        });

        kongTargetGroup.addTarget(kongFargateService);
        kongALB.addListener('KongListener', {
            port: 80,
            defaultTargetGroups: [kongTargetGroup]
        });

        new cdk.CfnOutput(this, 'KongEndpoint', {
            value: kongALB.loadBalancerDnsName,
            description: 'Kong API Gateway endpoint'
        }); 
        

    } 


}
