#pragma once
#include <QJsonObject>
#include <QSet>
#include <QStringList>
#include <deque>
#include <mutex>
#include <atomic>
namespace tt {
struct DispatchStats {
	uint64_t accepted{}, delivered{}, overflow{}, oversize{}, duplicate{}, coalesced{}, failed{};
};
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
	bool push(QJsonObject);
	QList<QJsonObject> take(size_t maximum = 128);
	DispatchStats snapshot() const;
	void delivered(bool);
	void shutdown();
};
} // namespace tt
