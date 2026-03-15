FROM python:3.12-slim

RUN pip install --no-cache-dir fastapi uvicorn requests ruamel.yaml

WORKDIR /app
COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8501"]