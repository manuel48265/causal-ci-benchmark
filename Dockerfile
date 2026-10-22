# We need to install some ubuntu libraries
FROM rocker/r-ver:4.6.1 AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl libuv1-dev libgsl-dev libnode-dev libicu-dev libcurl4-openssl-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV LD_LIBRARY_PATH=/usr/local/lib/R/lib

# Stage 1: R packages only
FROM base AS r-deps
ENV RENV_CONFIG_REPOS_OVERRIDE=https://packagemanager.posit.co/cran/__linux__/noble/latest
COPY renv.lock ./
RUN Rscript -e 'install.packages("renv"); renv::restore(lockfile = "renv.lock", library = .libPaths()[1], prompt = FALSE)'

# Stage 2: Python only
FROM base AS py-deps
COPY --from=ghcr.io/astral-sh/uv:0.12.16 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen

# Stage 3: Node and the frontend packages, for the demo and the prettier check
FROM base AS web-deps
COPY --from=node:24.22.1-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:24.22.1-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY demo/frontend/package.json demo/frontend/package-lock.json demo/frontend/
RUN npm --prefix demo/frontend ci

# Final image
FROM base
ENV UV_PYTHON_INSTALL_DIR=/opt/python
ENV RPY2_CFFI_MODE=ABI
COPY --from=r-deps /usr/local/lib/R/site-library /usr/local/lib/R/site-library
COPY --from=py-deps /usr/local/bin/uv /usr/local/bin/uv
COPY --from=py-deps /opt/python /opt/python
COPY --from=py-deps /app/.venv /app/.venv
COPY --from=web-deps /usr/local/bin /usr/local/bin
COPY --from=web-deps /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=web-deps /app/demo/frontend/node_modules /app/demo/frontend/node_modules
COPY . .
CMD ["make", "check"]