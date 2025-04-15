# 📲 CashTrack – Intelligent Expense Tracking via Microservices & Kafka

**CashTrack** is a cloud-native, microservices-based expense tracking system built for scalability and intelligent processing. Users can track their expenses via a mobile app (React Native), while backend microservices (Java + Python) handle authentication, data analysis, storage, and user management — all coordinated using Kafka and containerized with Docker.

---

## 🧠 Why I Built This

This project started as an exploration into scalable microservice design using Spring Boot and Kafka. The goal was to automate and intelligently process user expenses while learning large-scale architecture concepts such as:

- Asynchronous message handling with **Kafka**
- API gateway and traffic control via **Kong**
- Intelligent message processing with **LLMs in Python**
- Full **containerization** with Docker
- Infrastructure as code using **AWS CDK**

---

## 📦 Tech Stack

| Layer             | Technologies                                     |
|------------------|--------------------------------------------------|
| Mobile App        | React Native                                     |
| Backend Services  | Java Spring Boot (Auth, Expense, User), Python (dsService) |
| Communication     | Kafka (message broker), REST APIs               |
| Gateway           | Kong (API Gateway, Load Balancer)               |
| Storage           | MongoDB (User, Expense)                         |
| Deployment        | Docker + AWS CDK (initially)                    |

---

## 🧭 System Design Overview



---

### 🧩 Microservices Breakdown

#### 1. 🔐 **AuthService** (Java Spring Boot)
- Handles user login/signup
- On sign-up, **produces user info to Kafka**
- Secures APIs using access tokens (15min) and refresh tokens (7 days)
- Uses MongoDB (`authServiceDB`) to store session/tokens

#### 2. 👤 **UserService** (Java Spring Boot)
- **Consumes** user data from Kafka
- Stores user profiles in `userServiceDB`
- Can be queried independently or used by other services

#### 3. 🧠 **dsService** (Python + LLM)
- Listens for user messages
- Extracts expense-related info using NLP (LLMs)
- Sends parsed data to Kafka

#### 4. 💵 **ExpenseService** (Java Spring Boot)
- **Consumes** expense messages from Kafka
- Stores processed entries into `expenseServiceDB`
- Provides endpoints for expense analytics & breakdowns

---

### 📡 Kong Gateway

- Centralized API gateway for all services
- Handles routing, rate-limiting, and **load balancing**
- Every external request goes through Kong before hitting internal microservices

---

## 🐳 Deployment & Infrastructure

- All services were **containerized using Docker**
  - Individual `Dockerfile` for each service
  - Docker Compose was used for local orchestration
- Production deployment was done on **AWS** using **AWS CDK**
  - VPC, ECS, S3, RDS, and Kafka (MSK) resources were all provisioned via code
  - **Note**: Taken down due to high monthly AWS cost during experimentation

---

## 🔄 Kafka Usage

- A central event stream used to decouple services
- Used for:
  - Passing signup data from **AuthService ➝ UserService**
  - Sending NLP-analyzed messages from **dsService ➝ ExpenseService**

---

## 🔐 Authentication Strategy

- JWT access tokens (15 min expiry)
- Refresh tokens (7 days)
- Token verification happens inside Kong via the `/ping` endpoint
- Invalid or missing tokens result in a `401 Unauthorized`

---

## 🚀 Example Flow

1. User signs up via the mobile app
2. `AuthService` stores auth info and sends user data to Kafka
3. `UserService` consumes Kafka message and stores the profile
4. User sends a message like: _"Spent $50 on groceries today"_
5. `dsService` parses it → `{"amount": 50, "category": "groceries"}`
6. Message is pushed to Kafka
7. `ExpenseService` consumes it and stores in DB

---

## 🛠 Future Improvements

- Replace Python dsService with FastAPI + GPU-based LLM
- Add observability stack (Prometheus + Grafana)
- Use Redis for temporary token storage/cache

---

## 📜 License

MIT – see [`LICENSE`](./LICENSE)

---

## 🙌 Contributions

Open to PRs, feedback, and extensions! Contact me if you'd like to collaborate or improve this system.

