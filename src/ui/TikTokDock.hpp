#pragma once
#include <QWidget>
#include <QElapsedTimer>
#include "core/PluginConfig.hpp"
#include "core/TikTokConnectionManager.hpp"
#include "widgets/WidgetManager.hpp"
class QLineEdit;
class QLabel;
class QListWidget;
class QCheckBox;
namespace tt {
class EventMonitor;
class TikTokDock : public QWidget {
	PluginConfig &config;
	TikTokConnectionManager &connection;
	EventDispatcher &dispatcher;
	WidgetManager &widgets;
	QLineEdit *username, *bundlePath, *sessionPath;
	QCheckBox *retry, *autoConnect;
	QLabel *status;
	QListWidget *list;
	QElapsedTimer throughputClock;
	uint64_t previousAccepted = 0;
	double eventsPerSecond = 0;
	void connectRoom();
	void refreshList();
	void guarded(std::function<void()>);

public:
	EventMonitor *monitor;
	TikTokDock(PluginConfig &, TikTokConnectionManager &, EventDispatcher &, WidgetManager &);
	void updateStatus(const QString &bridgeError);
	void startAutoConnect();
};
} // namespace tt
