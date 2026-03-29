FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN groupadd -g 1000 appuser && useradd -u 1000 -g appuser -m appuser

WORKDIR /app

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY app /app

RUN mkdir -p /data /secrets && chown -R appuser:appuser /app /data /secrets

USER appuser

EXPOSE 8000

CMD ["python", "server.py"]
