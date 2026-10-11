#include "TikTokConnectionManager.hpp"
#include "EventNormalizer.hpp"
#include <QDateTime>
namespace tt {
TikTokConnectionManager::TikTokConnectionManager(EventDispatcher &d) : dispatch(d)
{
	owner = std::thread([this] { run(); });
}
TikTokConnectionManager::~TikTokConnectionManager()
{
	shutdown();
}
void TikTokConnectionManager::configure(QString b, QString c)
{
	std::lock_guard l(mutex);
	bundle = std::move(b);
	cookies = std::move(c);
}
void TikTokConnectionManager::connect(QString u)
{
	u = u.trimmed();
	if (u.startsWith('@'))
		u.remove(0, 1);
	std::lock_guard l(mutex);
	if (stopping)
		return;
	if (!pending && command.connect && u == username &&
	    (state == TTL_CONNECTION_CONNECTED || state == TTL_CONNECTION_CONNECTING ||
	     state == TTL_CONNECTION_RECONNECTING))
		return;
	username = u;
	command = {true, u, bundle, cookies, autoReconnect, ++generation};
	pending = true;
	cv.notify_one();
}
void TikTokConnectionManager::disconnect()
{
	std::lock_guard l(mutex);
	if (stopping)
		return;
	command = {false, {}, {}, {}, false, ++generation};
	pending = true;
	cv.notify_one();
}
void TikTokConnectionManager::reconnect()
{
	std::lock_guard l(mutex);
	if (stopping)
		return;
	command = {true, username, bundle, cookies, autoReconnect, ++generation};
	pending = true;
	cv.notify_one();
}
void TikTokConnectionManager::setAutoReconnect(bool value)
{
	std::lock_guard l(mutex);
	autoReconnect = value;
}
ttl_connection_state_t TikTokConnectionManager::getState() const
{
	std::lock_guard l(mutex);
	return state;
}
QString TikTokConnectionManager::getUsername() const
{
	std::lock_guard l(mutex);
	return username;
}
QString TikTokConnectionManager::lastError() const
{
	std::lock_guard l(mutex);
	return error;
}
bool TikTokConnectionManager::isConnected() const
{
	return getState() == TTL_CONNECTION_CONNECTED;
}
void TikTokConnectionManager::shutdown()
{
	{
		std::lock_guard l(mutex);
		if (stopping)
			return;
		stopping = true;
		cv.notify_one();
	}
	if (owner.joinable())
		owner.join();
}
QJsonObject TikTokConnectionManager::stateSnapshot() const
{
	std::lock_guard l(mutex);
	static const char *names[] = {"Disconnected", "Connecting", "Connected", "Reconnecting", "Offline", "Error"};
	return {{"version", 1},
		{"type", "state"},
		{"room", "@" + username},
		{"receivedTimestamp", QString::number(QDateTime::currentMSecsSinceEpoch())},
		{"data", QJsonObject{{"state", names[state]}, {"username", username}, {"error", error}}}};
}
void TikTokConnectionManager::update(ttl_connection_state_t s, QString e)
{
	{
		std::lock_guard l(mutex);
		state = s;
		if (s == TTL_CONNECTION_ERROR || s == TTL_CONNECTION_OFFLINE)
			error = e;
		else if (s == TTL_CONNECTION_CONNECTING)
			error.clear();
	}
	dispatch.push(stateSnapshot());
}
void TikTokConnectionManager::run()
{
	for (;;) {
		Command c;
		{
			std::unique_lock l(mutex);
			cv.wait(l, [this] { return stopping || pending; });
			if (stopping)
				break;
			c = command;
			pending = false;
		}
		client.reset();
		update(TTL_CONNECTION_DISCONNECTED, {});
		{
			std::lock_guard l(mutex);
			if (stopping || c.generation != generation)
				continue;
		}
		if (!c.connect)
			continue;
		if (ttl_live_abi_version() != TTL_LIVE_ABI_VERSION) {
			update(TTL_CONNECTION_ERROR, "Native library ABI mismatch");
			continue;
		}
		if (c.username.isEmpty() || c.bundle.isEmpty()) {
			update(TTL_CONNECTION_ERROR, "Username and a verified signing bundle are required");
			continue;
		}
		{
			std::lock_guard l(mutex);
			activeUsername = c.username;
		}
		update(TTL_CONNECTION_CONNECTING, {});
		auto u = c.username.toUtf8(), b = c.bundle.toUtf8(), session = c.cookies.toUtf8();
		ttl_live_options_t options{};
		options.struct_size = sizeof(options);
		options.unique_id = u.constData();
		options.unique_id_len = u.size();
		options.bundle = b.constData();
		options.bundle_len = b.size();
		options.reconnect = c.retry;
		options.max_reconnect_attempts = 1000;
		options.cookie_header = session.constData();
		options.cookie_header_len = session.size();
		client.reset(ttl_live_client_create(&options));
		if (!client) {
			update(TTL_CONNECTION_ERROR,
			       "Native client creation failed; verify the trusted signing bundle");
			continue;
		}
		{
			std::lock_guard l(mutex);
			if (stopping || c.generation != generation) {
				continue;
			}
		}
		ttl_live_client_set_event_callback(client.get(), eventCallback, this);
		ttl_live_client_set_state_callback(client.get(), stateCallback, this);
		ttl_live_client_set_error_callback(client.get(), errorCallback, this);
		if (ttl_live_client_connect(client.get()) != TTL_OK)
			update(TTL_CONNECTION_ERROR, "Native connect request failed");
	}
	client.reset();
	update(TTL_CONNECTION_DISCONNECTED, {});
}
void TikTokConnectionManager::eventCallback(void *p, const ttl_event_t *e) noexcept
{
	auto &self = *static_cast<TikTokConnectionManager *>(p);
	try {
		QString room;
		{
			std::lock_guard l(self.mutex);
			room = "@" + self.activeUsername;
		}
		self.dispatch.push(EventNormalizer::fromNative(e, room));
	} catch (...) {
		try {
			self.update(TTL_CONNECTION_ERROR, "Native event serialization failed");
		} catch (...) {
		}
	}
}
void TikTokConnectionManager::stateCallback(void *p, ttl_connection_state_t s, const char *, size_t) noexcept
{
	try {
		static_cast<TikTokConnectionManager *>(p)->update(s, {});
	} catch (...) {
	}
}
void TikTokConnectionManager::errorCallback(void *p, const ttl_error_info_t *e) noexcept
{
	try {
		static_cast<TikTokConnectionManager *>(p)->update(
			e->code == TTL_ERROR_OFFLINE ? TTL_CONNECTION_OFFLINE : TTL_CONNECTION_ERROR,
			QString("TikTok native error %1%2").arg(e->code).arg(e->retryable ? " (retryable)" : ""));
	} catch (...) {
	}
}
} // namespace tt
