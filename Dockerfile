FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y libc++1

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Install dependencies
RUN pnpm install

# Copy the rest of the source code
COPY . .

# Expose Vite and Wrangler ports
EXPOSE 5173
EXPOSE 8787

# Run the dev script
CMD ["pnpm", "dev"]
