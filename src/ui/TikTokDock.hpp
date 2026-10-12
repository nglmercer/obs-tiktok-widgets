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
class QPushButton;
namespace tt {
class EventMonitor;
class SigningBundleManager;
class TikTokDock : public QWidget {
	PluginConfig &config;
	TikTokConnectionManager &connection;
	EventDispatcher &dispatcher;
	WidgetManager &widgets;
	QLineEdit *username, *sessionPath;
	QCheckBox *retry, *autoConnect;
	QLabel *status, *diagnostics;
	QPushButton *connectButton, *reconnectButton;
	SigningBundleManager *bundleManager;
	QString preparationError;
	QListWidget *list;
	QLabel *projectDiagnostics;
	QElapsedTimer throughputClock;
	uint64_t previousAccepted = 0;
	double eventsPerSecond = 0;
	void connectRoom(bool reconnect = false);
	void refreshList();
	void guarded(std::function<void()>);

public:
	EventMonitor *monitor;
	TikTokDock(PluginConfig &, TikTokConnectionManager &, EventDispatcher &, WidgetManager &);
	void updateStatus(const QString &bridgeError);
	void startAutoConnect();
	void cancelPendingConnection();
	void projectState(const QString &id,const QString &state,const QString &diagnostic);
};
} // namespace tt
