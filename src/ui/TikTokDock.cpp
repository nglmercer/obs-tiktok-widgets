#include "TikTokDock.hpp"
#include "EventMonitor.hpp"
#include "WidgetEditor.hpp"
#include "WidgetGallery.hpp"
#include "obs/BrowserSourceManager.hpp"
#include "obs/OBSFrontendManager.hpp"
#include "core/EventNormalizer.hpp"
#include "core/SigningBundleManager.hpp"
#include <QTabWidget>
#include <QComboBox>
#include <QGridLayout>
#include <QGroupBox>
#include <QVBoxLayout>
#include <QFormLayout>
#include <QLineEdit>
#include <QLabel>
#include <QPushButton>
#include <QListWidget>
#include <QCheckBox>
#include <QMessageBox>
#include <QInputDialog>
#include <QDesktopServices>
#include <QUrl>
#include <QFile>
#include <QSaveFile>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QCryptographicHash>
#include <QTimer>
namespace tt {
TikTokDock::TikTokDock(PluginConfig &c, TikTokConnectionManager &n, EventDispatcher &d, WidgetManager &w)
	: config(c),
	  connection(n),
	  dispatcher(d),
	  widgets(w)
{
	throughputClock.start();
	auto *root = new QVBoxLayout(this);
	root->setContentsMargins(8, 8, 8, 8);
	auto *tabs = new QTabWidget(this);
	tabs->setObjectName("tiktokTabs");
	root->addWidget(tabs);
	auto *connectionPage = new QWidget;
	auto *connectionLayout = new QVBoxLayout(connectionPage);
	auto *widgetsPage = new QWidget;
	auto *widgetsLayout = new QVBoxLayout(widgetsPage);
	auto *eventsPage = new QWidget;
	auto *eventsLayout = new QVBoxLayout(eventsPage);
	tabs->addTab(connectionPage, tr("Connection"));
	tabs->addTab(widgetsPage, tr("Widgets"));
	tabs->addTab(eventsPage, tr("Events"));
	auto *intro = new QLabel(tr("Enter a TikTok username to connect. Setup is automatic."));
	intro->setWordWrap(true);
	connectionLayout->addWidget(intro);
	username = new QLineEdit(c.settings["username"].toString());
	username->setObjectName("tiktokUsername");
	username->setPlaceholderText(tr("@creator"));
	connectionLayout->addWidget(username);
	bundleManager = new SigningBundleManager(config, this);
	auto *connectionActions = new QGridLayout;
	connectionLayout->addLayout(connectionActions);
	connectButton = new QPushButton(tr("Connect"));
	reconnectButton = new QPushButton(tr("Reconnect"));
	auto *disconnectButton = new QPushButton(tr("Disconnect"));
	connectionActions->addWidget(connectButton, 0, 0);
	connectionActions->addWidget(disconnectButton, 0, 1);
	connectionActions->addWidget(reconnectButton, 1, 0, 1, 2);
	connect(connectButton, &QPushButton::clicked, this, [this] { guarded([this] { connectRoom(); }); });
	connect(reconnectButton, &QPushButton::clicked, this, [this] { guarded([this] { connectRoom(true); }); });
	connect(disconnectButton, &QPushButton::clicked, this, [this] {
		cancelPendingConnection();
		connection.disconnect();
	});
	connect(username, &QLineEdit::returnPressed, connectButton, &QPushButton::click);
	retry = new QCheckBox(tr("Reconnect automatically"));
	retry->setChecked(c.settings["autoReconnect"].toBool(true));
	connectionLayout->addWidget(retry);
	autoConnect = new QCheckBox(tr("Connect when OBS starts"));
	autoConnect->setChecked(c.settings["autoConnect"].toBool());
	connectionLayout->addWidget(autoConnect);
	status = new QLabel;
	status->setObjectName("connectionStatus");
	status->setWordWrap(true);
	connectionLayout->addWidget(status);
	auto *advanced = new QGroupBox(tr("Account session (optional)"));
	advanced->setCheckable(true);
	advanced->setChecked(false);
	auto *advancedLayout = new QVBoxLayout(advanced);
	sessionPath = new QLineEdit;
	sessionPath->setPlaceholderText(tr("Private session file"));
	sessionPath->setVisible(false);
	advancedLayout->addWidget(sessionPath);
	connect(advanced, &QGroupBox::toggled, sessionPath, &QWidget::setVisible);
	connectionLayout->addWidget(advanced);
	connectionLayout->addStretch();
	list = new QListWidget;
	widgetsLayout->addWidget(list, 1);
	refreshList();
	auto *widgetActions = new QGridLayout;
	widgetsLayout->addLayout(widgetActions);
	int widgetActionIndex = 0;
	std::function<void(const QString &, std::function<void()>)> button =
		[this, widgetActions, &widgetActionIndex](const QString &text, std::function<void()> fn) {
			auto *b = new QPushButton(text);
			widgetActions->addWidget(b, widgetActionIndex / 2, widgetActionIndex % 2);
			++widgetActionIndex;
			connect(b, &QPushButton::clicked, this, [this, fn] { guarded(fn); });
		};
	button(tr("Create widget"), [this] {
		auto type = WidgetGallery::choose(this);
		if (type.isEmpty())
			return;
		auto widget = WidgetConfig::create(type);
		if (!WidgetEditor::edit(widget, this))
			return;
		widgets.widgets.push_back(widget);
		try {
			widgets.save();
		} catch (...) {
			widgets.widgets.removeLast();
			throw;
		}
		refreshList();
	});
	button(tr("Configure widget"), [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		auto copy = widgets.widgets[i];
		if (WidgetEditor::edit(copy, this)) {
			widgets.materialize(copy);
			widgets.widgets[i] = copy;
			widgets.save();
			BrowserSourceManager::refresh(copy, widgets.materialize(copy));
			refreshList();
		}
	});
	button(tr("Duplicate widget"), [this] {
		auto i = list->currentRow();
		if (i >= 0) {
			widgets.duplicate(widgets.widgets[i].id());
			refreshList();
		}
	});
	button(tr("Delete widget"), [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		auto id = widgets.widgets[i].id();
		auto answer = QMessageBox::question(this, tr("Delete widget"),
						    tr("Remove its OBS Browser Sources too?"),
						    QMessageBox::Yes | QMessageBox::No | QMessageBox::Cancel);
		if (answer == QMessageBox::Cancel)
			return;
		if (answer == QMessageBox::Yes)
			BrowserSourceManager::remove(id);
		widgets.erase(id);
		refreshList();
	});
	button(tr("Remove widget Browser Sources"), [this] {
		auto i = list->currentRow();
		if (i >= 0 &&
		    QMessageBox::question(this, tr("Remove sources"),
					  tr("Remove all Browser Sources for this widget?")) == QMessageBox::Yes)
			BrowserSourceManager::remove(widgets.widgets[i].id());
	});
	button(tr("Add to current scene"), [this] {
		auto i = list->currentRow();
		if (i >= 0 && !BrowserSourceManager::add(widgets.widgets[i], widgets.materialize(widgets.widgets[i])))
			throw std::runtime_error("Cannot create browser_source in current scene");
	});
	button(tr("Add to selected scene"), [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		bool ok = false;
		auto scene = QInputDialog::getItem(this, tr("Select scene"), tr("Scene"), OBSFrontendManager::scenes(),
						   0, false, &ok);
		if (ok &&
		    !BrowserSourceManager::add(widgets.widgets[i], widgets.materialize(widgets.widgets[i]), scene))
			throw std::runtime_error("Cannot create Browser Source");
	});
	button(tr("Preview widget"), [this] {
		auto i = list->currentRow();
		if (i >= 0)
			QDesktopServices::openUrl(
				QUrl::fromLocalFile(widgets.materialize(widgets.widgets[i])).toString() + "?preview=1");
	});
	button(tr("Reset widget settings"), [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		auto &old = widgets.widgets[i];
		auto fresh = WidgetConfig::create(old.type());
		fresh.value["id"] = old.id();
		fresh.value["name"] = old.name();
		old = fresh;
		widgets.save();
		BrowserSourceManager::refresh(old, widgets.materialize(old));
	});
	button = [this, eventsLayout](const QString &text, std::function<void()> fn) {
		auto *b = new QPushButton(text);
		eventsLayout->addWidget(b);
		connect(b, &QPushButton::clicked, this, [this, fn] { guarded(fn); });
	};
	auto *testType = new QComboBox;
	testType->setObjectName("testEventType");
	testType->addItem(tr("All test events"), "all");
	for (auto type : {"chat", "gift", "like", "follow", "roomUser", "state", "unknown"})
		testType->addItem(QString::fromLatin1(type), QString::fromLatin1(type));
	eventsLayout->addWidget(testType);
	button(tr("Generate test events"), [this, testType] {
		static int sequence = 0;
		++sequence;
		const auto selected = testType->currentData().toString();
		for (auto type : {"chat", "like", "follow", "roomUser", "state", "unknown"})
			if (selected == "all" || selected == type)
				dispatcher.push(EventNormalizer::synthetic(type, sequence));
		if (selected != "all" && selected != "gift")
			return;
		for (int i = 1; i <= 3; ++i) {
			auto e = EventNormalizer::synthetic("gift", i);
			e["messageId"] = QString("fixture-gift-%1-%2").arg(sequence).arg(i);
			auto data = e["data"].toObject();
			data["group_id"] = QString("fixture-streak-%1").arg(sequence);
			e["data"] = data;
			dispatcher.push(e);
		}
	});
	monitor = new EventMonitor;
	eventsLayout->addWidget(monitor, 1);
	diagnostics = new QLabel;
	diagnostics->setWordWrap(true);
	eventsLayout->addWidget(diagnostics);
	setMinimumWidth(320);
	auto persist = [this] {
		config.settings["autoConnect"] = autoConnect->isChecked();
		config.settings["autoReconnect"] = retry->isChecked();
		config.settings["username"] = username->text();
		config.settings.remove("bundlePath");
		guarded([this] { config.save(); });
	};
	connect(autoConnect, &QCheckBox::toggled, this, persist);
	connect(retry, &QCheckBox::toggled, this, persist);
	connect(username, &QLineEdit::editingFinished, this, persist);
	updateStatus({});
}
void TikTokDock::guarded(std::function<void()> fn)
{
	try {
		fn();
	} catch (const std::exception &e) {
		QMessageBox::warning(this, tr("TikTok LIVE Widgets"), QString::fromUtf8(e.what()));
	}
}
void TikTokDock::refreshList()
{
	list->clear();
	for (const auto &w : widgets.widgets)
		list->addItem(w.name() + " (" + w.type() + ")");
}
void TikTokDock::connectRoom(bool forceReconnect)
{
	const auto requestedUsername = username->text().trimmed();
	if (requestedUsername.isEmpty() || requestedUsername == "@") {
		preparationError = tr("Enter a TikTok username first.");
		updateStatus({});
		username->setFocus();
		return;
	}
	if (bundleManager->isDownloading())
		return;
	QString cookies;
	if (!sessionPath->text().isEmpty()) {
		QFile file(sessionPath->text());
		if (!file.open(QIODevice::ReadOnly) || file.size() > 64 * 1024)
			throw std::runtime_error("Cannot read private session file");
		cookies = QString::fromUtf8(file.readAll()).trimmed();
	}
	config.settings["username"] = requestedUsername;
	config.settings["autoConnect"] = autoConnect->isChecked();
	config.settings["autoReconnect"] = retry->isChecked();
	config.settings.remove("bundlePath");
	config.save();
	preparationError.clear();
	const bool autoRetry = retry->isChecked();
	bundleManager->ensure(
		[this, requestedUsername, cookies, autoRetry, forceReconnect](QString bundle, QString error) {
			if (!error.isEmpty()) {
				preparationError = error;
				updateStatus({});
				return;
			}
			connection.configure(std::move(bundle), cookies);
			connection.setAutoReconnect(autoRetry);
			if (forceReconnect)
				connection.disconnect();
			connection.connect(requestedUsername);
			updateStatus({});
		});
	updateStatus({});
}
void TikTokDock::cancelPendingConnection()
{
	bundleManager->cancel();
	preparationError.clear();
	username->setEnabled(true);
	connectButton->setEnabled(true);
	reconnectButton->setEnabled(true);
}
void TikTokDock::startAutoConnect()
{
	if (autoConnect->isChecked())
		guarded([this] { connectRoom(); });
}
void TikTokDock::updateStatus(const QString &bridgeError)
{
	auto s = connection.stateSnapshot();
	if (!widgets.restorationError.isEmpty())
		status->setToolTip(tr("Widget restore: ") + widgets.restorationError);
	auto stats = dispatcher.snapshot();
	if (throughputClock.elapsed() >= 1000) {
		eventsPerSecond =
			static_cast<double>(stats.accepted - previousAccepted) * 1000.0 / throughputClock.restart();
		previousAccepted = stats.accepted;
	}
	const bool preparing = bundleManager->isDownloading();
	username->setEnabled(!preparing);
	connectButton->setEnabled(!preparing);
	reconnectButton->setEnabled(!preparing);
	QString text = preparing ? tr("Preparing connection… downloading and verifying setup files.")
				 : s["data"].toObject()["state"].toString();
	if (!connection.getUsername().isEmpty())
		text += " · @" + connection.getUsername();
	const auto error = !preparationError.isEmpty() ? preparationError
						       : (bridgeError.isEmpty() ? connection.lastError() : bridgeError);
	if (!error.isEmpty())
		text += "\n" + error;
	status->setText(text);
	diagnostics->setText(
		tr("%1 events/s · Received %2 · Delivered %3\nDropped %4 · Oversized %5 · Duplicates %6 · Delivery failures %7")
			.arg(eventsPerSecond, 0, 'f', 1)
			.arg(stats.accepted)
			.arg(stats.delivered)
			.arg(stats.overflow)
			.arg(stats.oversize)
			.arg(stats.duplicate)
			.arg(stats.failed));
}
} // namespace tt
