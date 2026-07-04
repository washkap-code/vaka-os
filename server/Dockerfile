FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm i -D tsx drizzle-kit typescript @types/node @types/express @types/jsonwebtoken @types/bcryptjs
COPY . .
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
