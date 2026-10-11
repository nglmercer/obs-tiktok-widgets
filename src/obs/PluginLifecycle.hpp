#pragma once
#include <QObject>
#include <memory>
#include "core/EventDispatcher.hpp"
#include "core/BrowserEventBridge.hpp"
namespace tt {
class PluginConfig;
class TikTokConnectionManager;
class WidgetManager;
class TikTokDock;
class PluginLifecycle : public QObject {
	EventDispatcher dispatcher;
	BrowserEventBridge bridge;
	std::unique_ptr<PluginConfig> config;
	std::unique_ptr<TikTokConnectionManager> connection;
	std::unique_ptr<WidgetManager> widgets;
	TikTokDock *dock = nullptr;
	bool started = false;

public:
	PluginLifecycle();
	~PluginLifecycle();
	void start();
	void stop();
};
} // namespace tt
