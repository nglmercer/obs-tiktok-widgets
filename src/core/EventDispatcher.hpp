#pragma once
#include <QJsonObject>
#include <QSet>
#include <QStringList>
#include <deque>
#include <mutex>
#include <atomic>
#include <utility>
namespace tt {
struct DispatchStats {
	uint64_t accepted{}, delivered{}, overflow{}, oversize{}, duplicate{}, coalesced{}, failed{};
};
enum class DispatchResult { Accepted, Duplicate, Overflow, Oversize, Stopped };
class EventDispatcher {
	mutable std::mutex mutex;
	std::deque<QJsonObject> queue;
	QSet<QString> identities;
	std::deque<QString> identityOrder;
	DispatchStats stats;
	bool stopped = false;
	size_t limit;

public:
	explicit EventDispatcher(size_t capacity = 2048) : limit(capacity) {}
	DispatchResult pushDetailed(QJsonObject);
	bool push(QJsonObject value) { return pushDetailed(std::move(value)) == DispatchResult::Accepted; }
	QList<QJsonObject> take(size_t maximum = 128);
	DispatchStats snapshot() const;
	void delivered(bool);
	void shutdown();
};
} // namespace tt
