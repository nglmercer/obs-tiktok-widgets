#pragma once
#include "NativeClientWrapper.hpp"
#include "EventDispatcher.hpp"
#include <QString>
#include <thread>
#include <condition_variable>
#include <functional>
namespace tt {
class TikTokConnectionManager {
	EventDispatcher &dispatch;
	mutable std::mutex mutex;
	std::condition_variable cv;
	std::thread owner;
	NativeClientWrapper client;
	bool stopping = false, pending = false, autoReconnect = true;
	uint64_t generation = 0;
	QString username, activeUsername, bundle, cookies, error;
	ttl_connection_state_t state = TTL_CONNECTION_DISCONNECTED;
	struct Command {
		bool connect;
		QString username, bundle, cookies;
		bool retry;
		uint64_t generation;
	} command{};
	void run();
	static void eventCallback(void *, const ttl_event_t *) noexcept;
	static void stateCallback(void *, ttl_connection_state_t, const char *, size_t) noexcept;
	static void errorCallback(void *, const ttl_error_info_t *) noexcept;
	void update(ttl_connection_state_t, QString);

public:
	explicit TikTokConnectionManager(EventDispatcher &);
	~TikTokConnectionManager();
	void configure(QString trustedBundle, QString session = {});
	void connect(QString);
	void disconnect();
	void reconnect();
	ttl_connection_state_t getState() const;
	QString getUsername() const;
	QString lastError() const;
	bool isConnected() const;
	void setAutoReconnect(bool);
	QJsonObject stateSnapshot() const;
	void shutdown();
};
} // namespace tt
