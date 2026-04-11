# 1. Node.js 22 LTS 버전을 베이스로 사용합니다.
FROM node:22-slim

# 2. FFmpeg 설치를 위해 시스템 패키지를 업데이트하고 설치합니다.
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 3. 작업 디렉토리를 설정합니다.
WORKDIR /app

# 4. 의존성 파일을 먼저 복사하여 캐시 효율을 높입니다.
COPY package*.json ./
RUN npm install --production

# 5. 소스 코드와 필요한 폴더들을 복사합니다.
COPY . .

# 6. 업로드 및 결과물이 저장될 폴더들을 생성합니다.
RUN mkdir -p uploads/results uploads/frames uploads/temp external-frames

# 7. 포트 설정 (Cloud Run은 환경 변수로 주입함)
ENV PORT 8080
EXPOSE 8080

# 8. 서버 실행!
CMD ["node", "server.js"]
