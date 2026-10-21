#pragma once
#include <QObject>
#include <memory>
#include "core/EventDispatcher.hpp"
#include "core/BrowserEventBridge.hpp"
#include "widgets/WidgetHealthManager.hpp"
#include "widgets/WidgetDeliveryTracker.hpp"
#include "widgets/WidgetTelemetryServer.hpp"
namespace tt {
class PluginConfig;
class TikTokConnectionManager;
class WidgetManager;
class TikTokDock;
class WidgetProjectWatcher;
class WidgetCommands;
class WidgetLocalIPC;
class ExternalEventReceiver;
class PluginLifecycle : public QObject {
	EventDispatcher dispatcher;
	BrowserEventBridge bridge;
	std::unique_ptr<WidgetHealthManager> health;
	WidgetDeliveryTracker deliveryHistory;
	std::unique_ptr<WidgetTelemetryServer> telemetry;
	std::unique_ptr<PluginConfig> config;
	std::unique_ptr<TikTokConnectionManager> connection;
	std::unique_ptr<WidgetManager> widgets;
	TikTokDock *dock = nullptr;
	bool started = false;
	std::unique_ptr<WidgetProjectWatcher> projectWatcher;
	std::unique_ptr<WidgetCommands> commands;
	std::unique_ptr<WidgetLocalIPC> ipc;
	std::unique_ptr<ExternalEventReceiver> eventReceiver;
	QJsonObject eventReceiverOptions;

public:
	PluginLifecycle();
	~PluginLifecycle();
	void start();
	void stop();
};
} // namespace tt
