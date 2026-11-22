# jar는 CPU 종류와 무관하므로 빌드는 빌드하는 컴퓨터의 플랫폼에서 한 번만 한다.
FROM --platform=$BUILDPLATFORM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src src
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/element-brawl-*.jar app.jar
# 계정과 전적 DB(H2 파일) 위치. docker-compose.yml 이 이 폴더에 볼륨을 붙여 재배포해도 남는다.
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
