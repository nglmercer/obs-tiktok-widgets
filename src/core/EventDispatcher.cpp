#include "EventDispatcher.hpp"
#include <QJsonDocument>
#include "universal/EventProtocol.hpp"
namespace tt {
DispatchResult EventDispatcher::pushDetailed(QJsonObject event)
{
	const auto size = QJsonDocument(event).toJson(QJsonDocument::Compact).size();
	std::lock_guard lock(mutex);
	if (stopped)
		return DispatchResult::Stopped;
	if (size > 1024 * 1024) {
		++stats.oversize;
		return DispatchResult::Oversize;
	}
	const bool canonical = event.contains("source") && event.contains("id");
	const auto id = canonical ? event["id"].toString() : event["messageId"].toString();
	const auto type = canonical ? event["type"].toString() : uw::canonicalType(event);
	const auto identity = canonical ? id : event["room"].toString() + ":" + id;
	const auto universalKey = "universal:" + type + ":" +
				  (type.startsWith("tiktok.") ? QString{} : event["source"].toString() + ":") +
				  identity;
	const auto key = canonical ? universalKey
				   : "legacy:" + event["room"].toString() + ":" + event["method"].toString() + ":" + id;
	if (!id.isEmpty() && id != "0" && identities.contains(key)) {
		++stats.duplicate;
		return DispatchResult::Duplicate;
	}
	if (queue.size() >= limit) {
		++stats.overflow;
		return DispatchResult::Overflow;
	}
	if (!id.isEmpty() && id != "0") {
		if (!canonical && identities.contains(universalKey))
			event["_universalDuplicate"] = true;
		if (!identities.contains(universalKey)) {
			identities.insert(universalKey);
			identityOrder.push_back(universalKey);
		}
		identities.insert(key);
		if (key != universalKey)
			identityOrder.push_back(key);
		while (identityOrder.size() > 8192) {
			identities.remove(identityOrder.front());
			identityOrder.pop_front();
		}
	}
	queue.push_back(std::move(event));
	++stats.accepted;
	return DispatchResult::Accepted;
}
QList<QJsonObject> EventDispatcher::take(size_t max)
{
	std::lock_guard lock(mutex);
	QList<QJsonObject> out;
	while (!queue.empty() && out.size() < static_cast<qsizetype>(max)) {
		out.push_back(std::move(queue.front()));
		queue.pop_front();
	}
	return out;
}
DispatchStats EventDispatcher::snapshot() const
{
	std::lock_guard lock(mutex);
	return stats;
}
void EventDispatcher::delivered(bool ok)
{
	std::lock_guard lock(mutex);
	if (ok)
		++stats.delivered;
	else
		++stats.failed;
}
void EventDispatcher::shutdown()
{
	std::lock_guard lock(mutex);
	stopped = true;
	stats.overflow += queue.size();
	queue.clear();
}
} // namespace tt
