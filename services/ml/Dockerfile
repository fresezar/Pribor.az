# Pribor ML servisi (FastAPI + CatBoost).
# Build bağlamı bu klasör:  docker build -f services/ml/Dockerfile services/ml
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# CatBoost için libgomp gerekli
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY pribor_ml ./pribor_ml
RUN pip install .

# Model artifact'leri: imaja gömülü DEĞİL (gitignore). Prod'da eğitilmiş
# artifacts/ bir volume ile /app/artifacts'e bağlanır; yoksa servis
# deterministik heuristik stub'a düşer (sözleşme aynı kalır).
VOLUME ["/app/artifacts"]
EXPOSE 8100
CMD ["uvicorn", "pribor_ml.main:app", "--host", "0.0.0.0", "--port", "8100"]
