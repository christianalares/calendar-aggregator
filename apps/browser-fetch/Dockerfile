FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npx patchright install --with-deps chrome && apt-get update && apt-get install -y --no-install-recommends xvfb xauth && rm -rf /var/lib/apt/lists/*
COPY *.ts ./
RUN useradd --create-home --uid 1001 browser && chown -R browser:browser /app
USER browser
ENV DISPLAY=:99
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp >/tmp/xvfb.log 2>&1 & exec node server.ts"]
