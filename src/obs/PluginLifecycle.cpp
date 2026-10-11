#include "PluginLifecycle.hpp"
#include "core/PluginConfig.hpp"
#include "core/TikTokConnectionManager.hpp"
#include "widgets/WidgetManager.hpp"
#include "ui/TikTokDock.hpp"
#include "ui/EventMonitor.hpp"
#include <obs-module.h>
#include <obs-frontend-api.h>
#include <QTimer>
#include <QElapsedTimer>
#include <QScrollArea>
#include <QNetworkAccessManager>
namespace tt {
PluginLifecycle::PluginLifecycle() = default;
PluginLifecycle::~PluginLifecycle()
{
	stop();
}
void PluginLifecycle::start()
{
	if (started)
		return;
	started = true;
	char *path = obs_module_config_path("");
	char *assets = obs_module_file("web");
	if (!path || !assets) {
		bfree(path);
		bfree(assets);
		throw std::runtime_error("Cannot resolve plugin paths");
	}
	QString directory = QString::fromUtf8(path), web = QString::fromUtf8(assets);
	bfree(path);
	bfree(assets);
	config = std::make_unique<PluginConfig>(directory);
	connection = std::make_unique<TikTokConnectionManager>(dispatcher);
	widgets = std::make_unique<WidgetManager>(directory, web);
	dock = new TikTokDock(*config, *connection, dispatcher, *widgets);
	auto *scroll = new QScrollArea;
	scroll->setWidget(dock);
	scroll->setWidgetResizable(true);
	if (!obs_frontend_add_dock_by_id("tiktok-live-widgets", "TikTok LIVE Widgets", scroll)) {
		delete scroll;
		dock = nullptr;
		throw std::runtime_error("Cannot register OBS dock");
	}
	bridge.verify();
	auto *timer = new QTimer(this);
	connect(timer, &QTimer::timeout, this, [this] {
		QElapsedTimer budget;
		budget.start();
		for (int i = 0; i < 128 && budget.elapsed() < 5; ++i) {
			auto batch = dispatcher.take(1);
			if (batch.isEmpty())
				break;
			const auto &e = batch.front();
			dispatcher.delivered(bridge.broadcast(e));
			dock->monitor->append(e);
		}
		dock->updateStatus(bridge.lastError());
	});
	timer->start(16);
	auto *snapshot = new QTimer(this);
	connect(snapshot, &QTimer::timeout, this, [this] { dispatcher.push(connection->stateSnapshot()); });
	snapshot->start(2000);
	dock->startAutoConnect();
}
void PluginLifecycle::stop()
{
	if (!started)
		return;
	started = false;
	for (auto *timer : findChildren<QTimer *>())
		timer->stop();
	if (dock)
		dock->cancelPendingConnection();
	if (connection)
		connection->shutdown();
	for (const auto &e : dispatcher.take(2048))
		dispatcher.delivered(bridge.broadcast(e));
	dispatcher.shutdown();
	if (dock) {
		for (auto *network : dock->findChildren<QNetworkAccessManager *>())
			delete network;
		obs_frontend_remove_dock("tiktok-live-widgets");
		dock = nullptr;
	}
	widgets.reset();
	connection.reset();
	config.reset();
}
} // namespace tt
