# MailPulse backend image, with the built dashboard and document viewer inside. Versions follow the
# 14-day rule (D-036). Build context: the repository root (infra/docker-compose.yml). scripts\dev.ps1
# builds dashboard\dist and viewer\dist first, so Node is not needed inside Docker.

# Build stage: compile and package with Maven on JDK 25.
FROM maven:3.9.12-eclipse-temurin-25 AS build
WORKDIR /src
COPY backend/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY backend/src/main ./src/main
COPY dashboard/dist ./src/main/resources/static
COPY viewer/dist ./src/main/resources/static/viewer
RUN mvn -B -q package -DskipTests

# Runtime stage: JRE only, unprivileged user.
FROM eclipse-temurin:25.0.4.1_1-jre
RUN groupadd --system mailpulse && useradd --system --gid mailpulse --home-dir /app --no-create-home mailpulse
WORKDIR /app
COPY --from=build /src/target/mailpulse-backend-*.jar /app/mailpulse.jar
USER mailpulse
EXPOSE 8080 8081
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/mailpulse.jar"]