#include "WidgetHealthManager.hpp"
#include <QJsonDocument>
#include <QRegularExpression>
namespace tt {
bool WidgetHealthManager::report(const QJsonObject &p, qint64 now)
{
	if (stopped || p["protocol"] != "widget-health/v1" || p["sessionId"] != session ||
	    QJsonDocument(p).toJson(QJsonDocument::Compact).size() > 8192)
		return false;
	static const QRegularExpression identity("^[A-Za-z0-9_.:-]{1,128}$");
	const auto widget = p["widgetId"].toString(), id = p["instanceId"].toString(), build = p["buildId"].toString();
	if (!identity.match(widget).hasMatch() || !identity.match(id).hasMatch() || !identity.match(build).hasMatch())
		return false;
	const auto kind = p["kind"].toString();
	static const QStringList kinds{"loading",         "ready",          "heartbeat",     "event.received",
				       "event.processed", "event.rendered", "event.skipped", "event.failed",
				       "asset.failed",    "font.status",    "audio.failed",  "runtime.error",
				       "pagehide",        "recovery.ready"};
	if (!kinds.contains(kind))
		return false;
	if (!instances.contains(id) && instances.size() >= 256)
		return false;
	if (instances.contains(id) && (instances[id].widget != widget || instances[id].build != build))
		return false;
	const auto data = p["data"].toObject();
	if ((kind == "ready" || kind == "recovery.ready") && !data["widgetMounted"].toBool())
		return false;
	auto &i = instances[id];
	i.widget = widget;
	i.instance = id;
	i.build = build;
	i.seen = now;
	if (kind == "ready" || kind == "recovery.ready") {
		i.mounted = true;
		i.runtime = "ready";
	} else if (kind == "loading") {
		i.mounted = false;
		i.runtime = "loading";
	} else if (kind == "pagehide")
		i.runtime = "suspended";
	else if (kind == "heartbeat" && i.mounted && i.runtime != "failed")
		i.runtime = "ready";
	else if (kind == "runtime.error") {
		i.runtime = "failed";
		i.code = "JS_EXCEPTION";
	} else if (kind == "asset.failed") {
		i.assets = "degraded";
		i.code = "ASSET_MISSING";
	} else if (kind == "audio.failed")
		i.code = "AUDIO_FAILED";
	else if (kind == "font.status" && data["status"] != "ready") {
		i.assets = "degraded";
		i.code = "FONT_DEGRADED";
	} else if (kind.startsWith("event.")) {
		i.rendering = kind.mid(6);
		const auto eventId = data["eventId"].toString();
		if (identity.match(eventId).hasMatch()) {
			i.eventId = eventId;
			i.eventStage = kind.mid(6);
			i.deliveries.append(QJsonObject{{"eventId", eventId}, {"stage", i.eventStage}});
			while (i.deliveries.size() > 100)
				i.deliveries.removeFirst();
		}
		if (kind == "event.failed")
			i.code = "HANDLER_FAILED";
	}
	return true;
}
} // namespace tt

namespace tt {
void WidgetHealthManager::tick(qint64 now, qint64 timeout)
{
	for (auto it = instances.begin(); it != instances.end();) {
		if (now - it->seen > 300000)
			it = instances.erase(it);
		else
			++it;
	}
	for (auto &i : instances)
		if ((i.runtime == "ready" || i.runtime == "loading") && now - i.seen > timeout)
			i.runtime = "unresponsive";
}
void WidgetHealthManager::vendorResult(bool accepted)
{
	if (stopped)
		return;
	bridge = accepted ? "healthy" : "error";
	if (accepted)
		++vendorAccepted;
	else
		++vendorFailed;
}
QJsonObject WidgetHealthManager::snapshot(qint64 now) const
{
	QJsonArray pages;
	for (const auto &i : instances)
		pages.append(QJsonObject{{"widgetId", i.widget},
					 {"instanceId", i.instance},
					 {"buildId", i.build},
					 {"runtime", i.runtime},
					 {"assets", i.assets},
					 {"rendering", i.rendering},
					 {"placement", "unmapped"},
					 {"lastReportAgeMs", qMax(qint64(0), now - i.seen)},
					 {"code", i.code},
					 {"lastEventId", i.eventId},
					 {"lastEventStage", i.eventStage},
					 {"deliveries", i.deliveries}});
	return {{"protocol", "widget-health/v1"},
		{"bridge", bridge},
		{"vendorAccepted", QString::number(vendorAccepted)},
		{"vendorFailed", QString::number(vendorFailed)},
		{"telemetry", instances.isEmpty() ? "unobservable" : "reporting"},
		{"telemetryReason", "CEF_TRANSPORT_UNVERIFIED"},
		{"automaticRecovery", false},
		{"visualVerified", false},
		{"instances", pages}};
}
void WidgetHealthManager::shutdown()
{
	stopped = true;
	instances.clear();
	session.clear();
}
} // namespace tt
