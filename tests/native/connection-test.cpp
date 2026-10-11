#include "core/TikTokConnectionManager.hpp"
#include <QCoreApplication>
#include <atomic>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <vector>
using namespace std::chrono_literals;
struct ttl_live_client {
	ttl_state_callback_t state{};
	void *userdata{};
};
static std::atomic<int> live = 0, maxLive = 0, created = 0;
extern "C" {
ttl_live_client_t *ttl_live_client_create(const ttl_live_options_t *)
{
	int n = ++live;
	maxLive.store(std::max(n, maxLive.load()));
	++created;
	return new ttl_live_client;
}
ttl_result_t ttl_live_client_connect(ttl_live_client_t *c)
{
	if (c->state)
		c->state(c->userdata, TTL_CONNECTION_CONNECTED, nullptr, 0);
	return TTL_OK;
}
ttl_result_t ttl_live_client_disconnect(ttl_live_client_t *c)
{
	if (c->state)
		c->state(c->userdata, TTL_CONNECTION_DISCONNECTED, nullptr, 0);
	return TTL_OK;
}
void ttl_live_client_destroy(ttl_live_client_t *c)
{
	--live;
	delete c;
}
ttl_result_t ttl_live_client_set_state_callback(ttl_live_client_t *c, ttl_state_callback_t f, void *p)
{
	c->state = f;
	c->userdata = p;
	return TTL_OK;
}
ttl_result_t ttl_live_client_set_event_callback(ttl_live_client_t *, ttl_event_callback_t, void *)
{
	return TTL_OK;
}
ttl_result_t ttl_live_client_set_error_callback(ttl_live_client_t *, ttl_error_callback_t, void *)
{
	return TTL_OK;
}
}
static void waitConnected(tt::TikTokConnectionManager &m)
{
	for (int i = 0; i < 500 && !m.isConnected(); ++i)
		std::this_thread::sleep_for(1ms);
	if (!m.isConnected())
		throw std::runtime_error("connect timeout");
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	tt::EventDispatcher d;
	tt::TikTokConnectionManager m(d);
	m.configure("fixture signer source");
	std::vector<std::thread> threads;
	for (int i = 0; i < 16; ++i)
		threads.emplace_back([&] { m.connect("same"); });
	for (auto &t : threads)
		t.join();
	waitConnected(m);
	for (int i = 0; i < 100; ++i) {
		m.disconnect();
		m.connect("same");
		std::this_thread::sleep_for(1ms);
		waitConnected(m);
	}
	if (maxLive != 1)
		throw std::runtime_error("multiple active clients");
	for (int i = 0; i < 100; ++i) {
		m.disconnect();
		m.connect(QString("creator%1").arg(i));
	}
	std::this_thread::sleep_for(20ms);
	m.shutdown();
	if (live != 0 || maxLive != 1)
		throw std::runtime_error("resource lifecycle failure");
	m.connect("after shutdown");
	std::cout << "Concurrent command and cancellation lifecycle test passed (fake transport, " << created
		  << " clients created)\n";
}
