#pragma once
#include <QJsonObject>
#include <QJsonArray>
#include <QMap>
#include <QString>

namespace tt {
// All deadlines use caller supplied monotonic milliseconds. No network or OBS calls here.
class WidgetHealthManager {
public:
	struct Instance {
		QString widget, instance, build, runtime = "loading", assets = "ready", rendering = "idle", code;
		qint64 seen = 0;
		bool mounted = false;
		QString eventId, eventStage;
		QJsonArray deliveries;
	};

private:
	QString session;
	QMap<QString, Instance> instances;
	quint64 vendorAccepted = 0, vendorFailed = 0;
	QString bridge = "unavailable";
	bool stopped = false;

public:
	explicit WidgetHealthManager(QString sessionId) : session(std::move(sessionId)) {}
	bool report(const QJsonObject &, qint64 now);
	void tick(qint64 now, qint64 timeout = 15000);
	void vendorResult(bool accepted);
	QJsonObject snapshot(qint64 now) const;
	void shutdown();
};
} // namespace tt
