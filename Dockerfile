# 빌드
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src src
RUN mvn -q -B package -DskipTests

# 실행
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/element-brawl-*.jar app.jar
# 계정과 전적 DB 위치. 호스팅에서 영구 디스크를 /data 에 붙이면 재배포해도 남음
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
