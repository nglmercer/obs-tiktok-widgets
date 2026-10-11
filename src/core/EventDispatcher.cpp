#include "EventDispatcher.hpp"
#include <QJsonDocument>
namespace tt {
bool EventDispatcher::push(QJsonObject event)
{
	const auto size = QJsonDocument(event).toJson(QJsonDocument::Compact).size();
	std::lock_guard lock(mutex);
	if (stopped)
		return false;
	if (size > 1024 * 1024) {
		++stats.oversize;
		return false;
	}
	const auto id = event["messageId"].toString();
	const auto key = event["room"].toString() + ":" + event["method"].toString() + ":" + id;
	if (!id.isEmpty() && id != "0" && identities.contains(key)) {
		++stats.duplicate;
		return false;
	}
	if (queue.size() >= limit) {
		++stats.overflow;
		return false;
	}
	if (!id.isEmpty() && id != "0") {
		identities.insert(key);
		identityOrder.push_back(key);
		if (identityOrder.size() > 8192) {
			identities.remove(identityOrder.front());
			identityOrder.pop_front();
		}
	}
	queue.push_back(std::move(event));
	++stats.accepted;
	return true;
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
