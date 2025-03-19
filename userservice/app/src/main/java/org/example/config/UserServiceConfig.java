package org.example.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
public class UserServiceConfig
{

    @Bean
    public ObjectMapper objectMapperInit(){
        return new ObjectMapper();
    }

}