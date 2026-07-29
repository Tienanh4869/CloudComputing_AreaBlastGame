// src/instrumentation.js - OpenTelemetry Auto-Instrumentation
const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');

// Bỏ qua khởi tạo nếu không có cấu hình OTLP Endpoint
if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  console.log('[OTel] Bỏ qua giám sát do không tìm thấy OTEL_EXPORTER_OTLP_ENDPOINT');
} else {
  const sdk = new opentelemetry.NodeSDK({
    serviceName: 'arenablast-backend',
    traceExporter: new OTLPTraceExporter(),
    metricReader: new opentelemetry.metrics.PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 10000,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[OTel] Tắt giám sát thành công'))
      .catch((error) => console.error('[OTel] Lỗi khi tắt giám sát', error))
      .finally(() => process.exit(0));
  });
}
