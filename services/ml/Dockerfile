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

# Model artifact'leri imaja GÖMÜLÜ. Önceden volume bekleniyordu ama Render'ın
# ücretsiz planında kalıcı disk yok — volume hiç bağlanmıyor, servis sessizce
# heuristik stub'a düşüyor ve eğitilmiş model canlıya hiç çıkmıyordu.
# Artifact yoksa build kırılmasın: klasör boşsa servis yine stub'a düşer
# (API sözleşmesi model olsun olmasın aynı kalır).
COPY artifacts ./artifacts
# Render/PaaS $PORT enjekte eder; yoksa lokal 8100. Env genişlemesi için shell-form.
EXPOSE 8100
CMD ["sh", "-c", "uvicorn pribor_ml.main:app --host 0.0.0.0 --port ${PORT:-8100}"]
