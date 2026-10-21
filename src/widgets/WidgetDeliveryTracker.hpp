#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QRegularExpression>
namespace tt {
// Redacted native delivery history; vendor acceptance is never a browser ACK.
class WidgetDeliveryTracker {
	QList<QJsonObject> history;

public:
	void record(const QJsonObject &event, bool accepted)
	{
		const auto rawId = (event.contains("source") ? event["id"] : event["messageId"]).toString();
		static const QRegularExpression identifier("^[A-Za-z0-9_.:-]{1,128}$");
		const auto id = identifier.match(rawId).hasMatch() ? rawId : QString{};
		const auto rawType = event["type"].toString();
		const auto type = identifier.match(rawType).hasMatch() ? rawType : QString("unknown");
		history.append({{"eventId", id},
				{"eventType", type},
				{"synthetic", event["synthetic"].toBool()},
				{"vendorAccepted", accepted},
				{"browserOutcome", "unobservable"},
				{"visualVerified", false}});
		while (history.size() > 100)
			history.removeFirst();
	}
	QJsonArray snapshot() const
	{
		QJsonArray a;
		for (const auto &e : history)
			a.append(e);
		return a;
	}
};
} // namespace tt
