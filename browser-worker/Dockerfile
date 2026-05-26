FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

COPY package.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev
COPY src ./src

ENV NODE_ENV=production
ENV BROWSER_WORKER_PORT=8095
ENV BROWSER_RUNTIME_MODE=playwright
ENV BROWSER_PROFILE_ROOT=/browser_profiles

EXPOSE 8095

CMD ["npm", "start"]
