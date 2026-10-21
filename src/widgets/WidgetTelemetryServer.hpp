#pragma once
#include <QObject>
#include <QTcpServer>
#include <QElapsedTimer>
#include <QMap>
#include "WidgetHealthManager.hpp"
namespace tt {
// Telemetry only. This listener has no command, event injection or filesystem API.
class WidgetTelemetryServer : public QObject {
	QTcpServer server;
	WidgetHealthManager &health;
	QElapsedTimer clock;
	QByteArray token;
	QString session, bootstrap;
	QMap<QString, QPair<qint64, int>> rates;
	qint64 window = 0;
	int requests = 0;
	quint64 connections = 0;
	int lastStatus = 0;
	QString originCategory;

public:
	WidgetTelemetryServer(WidgetHealthManager &, QString sessionId, QObject *parent = nullptr);
	~WidgetTelemetryServer();
	bool start(const QString &directory);
	void stop();
	qint64 now() const { return clock.isValid() ? clock.elapsed() : 0; }
	QJsonObject diagnostics() const
	{
		return {{"listening", server.isListening()},
			{"connections", QString::number(connections)},
			{"lastHttpStatus", lastStatus},
			{"originCategory", originCategory}};
	}
	quint16 port() const { return server.serverPort(); }
};
} // namespace tt
