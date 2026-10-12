#include <QSettings>
#include <QSignalBlocker>
#include <QLocale>
#include "UiLocale.hpp"
#include "StudioLauncher.hpp"
#include "WidgetActions.hpp"
#include <QProcess>
#include <QCoreApplication>
#include <QStandardPaths>
#include <QUrlQuery>
#include <QMessageBox>
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
#include <QMenu>
#include <QFileInfo>
#include <QDir>
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
	tabs->addTab(connectionPage, uiTr("Connection"));
	tabs->addTab(widgetsPage, uiTr("Widgets"));
	tabs->addTab(eventsPage, uiTr("Events"));
	auto *intro = new QLabel(uiTr("Enter a TikTok username to connect. Setup is automatic."));
	intro->setWordWrap(true);
	connectionLayout->addWidget(intro);
	username = new QLineEdit(c.settings["username"].toString());
	username->setObjectName("tiktokUsername");
	username->setPlaceholderText(uiTr("@creator"));
	connectionLayout->addWidget(username);
	bundleManager = new SigningBundleManager(config, this);
	auto *connectionActions = new QGridLayout;
	connectionLayout->addLayout(connectionActions);
	connectButton = new QPushButton(uiTr("Connect"));
	reconnectButton = new QPushButton(uiTr("Reconnect"));
	auto *disconnectButton = new QPushButton(uiTr("Disconnect"));
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
	retry = new QCheckBox(uiTr("Reconnect automatically"));
	retry->setChecked(c.settings["autoReconnect"].toBool(true));
	connectionLayout->addWidget(retry);
	autoConnect = new QCheckBox(uiTr("Connect when OBS starts"));
	autoConnect->setChecked(c.settings["autoConnect"].toBool());
	connectionLayout->addWidget(autoConnect);
	status = new QLabel;
	status->setObjectName("connectionStatus");
	status->setWordWrap(true);
	connectionLayout->addWidget(status);
	auto *advanced = new QGroupBox(uiTr("Account session (optional)"));
	advanced->setCheckable(true);
	advanced->setChecked(false);
	auto *advancedLayout = new QVBoxLayout(advanced);
	sessionPath = new QLineEdit;
	sessionPath->setPlaceholderText(uiTr("Private session file"));
	sessionPath->setVisible(false);
	advancedLayout->addWidget(sessionPath);
	connect(advanced, &QGroupBox::toggled, sessionPath, &QWidget::setVisible);
	connectionLayout->addWidget(advanced);
	connectionLayout->addStretch();
	auto *help = new QLabel(uiTr("1. Create a widget   2. Edit its appearance   3. Add it to a scene"));
	help->setWordWrap(true);
	widgetsLayout->addWidget(help);
	list = new QListWidget;
	widgetsLayout->addWidget(list, 1);
	refreshList();
	auto *widgetActions = new QGridLayout;
	widgetsLayout->addLayout(widgetActions);
	auto *more = new QPushButton(uiTr("More actions…"));
	decorateWidgetButton(more, widgets.projects.assetDirectory(), "settings");
	auto *moreMenu = new QMenu(more);
	more->setMenu(moreMenu);
	widgetActions->addWidget(more, 2, 0, 1, 2);
	auto *manageMenu = moreMenu->addMenu(uiTr("Manage"));
	auto *projectMenu = moreMenu->addMenu(uiTr("Project"));
	auto *advancedMenu = moreMenu->addMenu(uiTr("Advanced"));
	auto *studioButton = new QPushButton(uiTr("Open Studio"));
	decorateWidgetButton(studioButton, widgets.projects.assetDirectory(), "studio");
	widgetActions->addWidget(studioButton, 0, 1);
	auto *studioState = new QLabel;
	studioState->setWordWrap(true);
	widgetsLayout->addWidget(studioState);
	studioLauncher = new StudioLauncher(this);
	studioLauncher->navigate = [this](const QUrl &url) {
		auto localized = url;
		QUrlQuery query(localized);
		query.addQueryItem("lang", config.settings["uiLocale"].toString("en"));
		localized.setQuery(query);
		QDesktopServices::openUrl(localized);
	};
	studioLauncher->changed = [studioButton, studioState](StudioLauncher::State state, const QString &message) {
		studioButton->setText(state == StudioLauncher::State::Starting ? uiTr("Starting Studio…")
									       : uiTr("Open Studio"));
		studioButton->setToolTip(uiTr(message));
		studioState->setText(uiTr(message));
	};
	connect(studioButton, &QPushButton::clicked, this, [this] {
		guarded([this] {
			if (studioLauncher->state == StudioLauncher::State::Idle ||
			    studioLauncher->state == StudioLauncher::State::Error) {
				if (uiQuestion(
					    this, uiTr("Open Widget Studio"),
					    uiTr("Start an authenticated, loopback-only authoring interface? Templates are trusted code. Close OBS to stop this session.")) !=
				    QMessageBox::Yes)
					return;
			}
			const auto tool = StudioLauncher::executable(widgets.projects.assetDirectory());
			if (tool.isEmpty())
				throw std::runtime_error("Install widgetstudio beside widgetctl.");
			const QString selected = list->currentRow() >= 0 ? widgets.widgets[list->currentRow()].id()
									 : QString();
			studioLauncher->open(tool,
					     {"--parent-pid", QString::number(QCoreApplication::applicationPid()),
					      "--confirm", "--config", widgets.projects.directory(), "--assets",
					      widgets.projects.assetDirectory()},
					     selected);
		});
	});

	std::function<void(const QString &, const QString &, const QString &, std::function<void()>)> button =
		[this, widgetActions, manageMenu, projectMenu, advancedMenu](
			const QString &id, const QString &source, const QString &group, std::function<void()> fn) {
			const auto text = uiTr(source);
			if (group != "primary") {
				auto *menu = group == "manage"    ? manageMenu
					     : group == "project" ? projectMenu
								  : advancedMenu;
				auto *action = widgetAction(menu, widgets.projects.assetDirectory(), id);
				if (!action)
					action = new QAction(menu);
				action->setObjectName("widget.action." + id);
				action->setData(id);
				action->setText(text);
				menu->addAction(action);
				action->setEnabled(id == "native-gallery" || list->currentRow() >= 0);
				connect(list, &QListWidget::currentRowChanged, action, [action, id](int row) {
					action->setEnabled(id == "native-gallery" || row >= 0);
				});
				connect(action, &QAction::triggered, this, [this, fn] { guarded(fn); });
				return;
			}
			auto *b = new QPushButton(text);
			decorateWidgetButton(b, widgets.projects.assetDirectory(), id);
			b->setObjectName("widget.action." + id);
			b->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
			if (id != "new") {
				b->setEnabled(list->currentRow() >= 0);
				connect(list, &QListWidget::currentRowChanged, b,
					[b](int row) { b->setEnabled(row >= 0); });
			}
			const int row = id == "new" ? 0 : 1, col = id == "scene" ? 1 : 0;
			widgetActions->addWidget(b, row, col);
			connect(b, &QPushButton::clicked, this, [this, fn] { guarded(fn); });
		};
	button("new", "Create widget", "primary", [studioButton] { studioButton->click(); });
	button("native-gallery", "Native gallery", "advanced", [this] {
		auto type = WidgetGallery::choose(this, &widgets.projects);
		if (type.isEmpty())
			return;
		if (type.startsWith("project:")) {
			widgets.load();
			refreshList();
			return;
		}
		auto widget = widgets.create(type);
		if (!WidgetEditor::edit(widget, this, &widgets.projects)) {
			widgets.erase(widget.id());
			return;
		}
		widgets.widgets.last() = widget;
		try {
			widgets.save();
		} catch (...) {
			widgets.widgets.removeLast();
			throw;
		}
		refreshList();
		list->setCurrentRow(widgets.widgets.size() - 1);
	});
	button("edit", "Edit widget", "manage", [studioButton] { studioButton->click(); });
	button("native-editor", "Native settings editor", "advanced", [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		auto copy = widgets.widgets[i];
		if (WidgetEditor::edit(copy, this, &widgets.projects)) {

			widgets.widgets[i] = copy;
			widgets.save();

			refreshList();
		}
	});
	button("duplicate", "Duplicate widget", "manage", [this] {
		auto i = list->currentRow();
		if (i >= 0) {
			widgets.duplicate(widgets.widgets[i].id());
			refreshList();
		}
	});
	button("delete", "Delete widget", "manage", [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		auto id = widgets.widgets[i].id();
		auto answer = uiQuestion(this, uiTr("Delete widget"), uiTr("Remove its OBS Browser Sources too?"),
					 QMessageBox::Yes | QMessageBox::No | QMessageBox::Cancel);
		if (answer == QMessageBox::Cancel)
			return;
		if (answer == QMessageBox::Yes)
			BrowserSourceManager::remove(id);
		widgets.erase(id);
		refreshList();
	});
	button("remove-sources", "Remove widget Browser Sources", "advanced", [this] {
		auto i = list->currentRow();
		if (i >= 0 && uiQuestion(this, uiTr("Remove sources"),
					 uiTr("Remove all Browser Sources for this widget?")) == QMessageBox::Yes)
			BrowserSourceManager::remove(widgets.widgets[i].id());
	});
	button("scene", "Add to scene", "primary", [this] {
		auto i = list->currentRow();
		if (i >= 0 && !BrowserSourceManager::add(widgets.widgets[i], widgets.materialize(widgets.widgets[i])))
			throw std::runtime_error("Cannot create browser_source in current scene");
	});
	button("scene-select", "Add to selected scene", "manage", [this] {
		auto i = list->currentRow();
		if (i < 0)
			return;
		bool ok = false;
		auto scene = QInputDialog::getItem(this, uiTr("Select scene"), uiTr("Scene"),
						   OBSFrontendManager::scenes(), 0, false, &ok);
		if (ok &&
		    !BrowserSourceManager::add(widgets.widgets[i], widgets.materialize(widgets.widgets[i]), scene))
			throw std::runtime_error("Cannot create Browser Source");
	});
	button("preview-html", "Preview widget", "advanced", [this] {
		auto i = list->currentRow();
		if (i >= 0)
			QDesktopServices::openUrl(
				QUrl::fromLocalFile(widgets.materialize(widgets.widgets[i])).toString() + "?preview=1");
	});
	button("preview", "Preview", "primary", [this] {
		const auto i = list->currentRow();
		if (i >= 0 &&
		    !QDesktopServices::openUrl(QUrl::fromLocalFile(widgets.materializePlayground(widgets.widgets[i]))))
			throw std::runtime_error("Cannot open Event Playground in the system browser");
	});
	button("reset", "Reset widget settings", "advanced", [this] {
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
	button("files", "Open widget project", "project", [this] {
		const auto i = list->currentRow();
		if (i >= 0)
			QDesktopServices::openUrl(
				QUrl::fromLocalFile(widgets.projects.projectPath(widgets.widgets[i].id()) + "/src"));
	});
	button("validate", "Validate widget project", "project", [this] {
		const auto i = list->currentRow();
		if (i >= 0) {
			widgets.projects.validate(widgets.widgets[i].id());
			projectDiagnostics->setText(uiTr("Project valid"));
		}
	});
	button("publish", "Publish widget project", "project", [this] {
		const auto i = list->currentRow();
		if (i >= 0) {
			widgets.publish(widgets.widgets[i].id());
			BrowserSourceManager::refresh(widgets.widgets[i], widgets.materialize(widgets.widgets[i]));
			projectDiagnostics->setText(uiTr("Published"));
		}
	});
	auto *ipcEnabled = new QCheckBox(uiTr("CLI access (local)"));
	ipcEnabled->setToolTip(uiTr("Enable authenticated local widgetctl control"));
	ipcEnabled->setChecked(config.settings["widgetctlEnabled"].toBool());
	widgetsLayout->addWidget(ipcEnabled);
	connect(ipcEnabled, &QCheckBox::toggled, this, [this](bool enabled) {
		config.settings["widgetctlEnabled"] = enabled;
		guarded([this] { config.save(); });
	});
	projectDiagnostics = new QLabel;
	projectDiagnostics->setObjectName("projectDiagnostics");
	projectDiagnostics->setWordWrap(true);
	widgetsLayout->addWidget(projectDiagnostics);
	auto *testType = new QComboBox;
	testType->setObjectName("testEventType");
	testType->addItem(uiTr("All test events"), "all");
	for (auto type : {"chat", "gift", "like", "follow", "roomUser", "state", "unknown"})
		testType->addItem(QString::fromLatin1(type), QString::fromLatin1(type));
	eventsLayout->addWidget(testType);
	auto *integrationButton = new QPushButton(uiTr("Integration test"));
	integrationButton->setObjectName("widget.action.integration-test");
	integrationButton->setToolTip(uiTr("Broadcast synthetic events to OBS (integration test)"));
	eventsLayout->addWidget(integrationButton);
	connect(integrationButton, &QPushButton::clicked, this, [this, testType] {
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
	setMinimumWidth(280);
	auto *language = new QComboBox;
	uiLanguage = language;
	language->setObjectName("uiLanguage");
	language->setAccessibleName(uiTr("Language"));
	language->addItem("English", "en");
	language->addItem("Español", "es");
	root->addWidget(language);
	auto *locale = new UiLocale(widgets.projects.assetDirectory(), this);
	uiLocale = locale;
	locale->bind(this);
	QSettings preferences(config.directory + "/ui-preferences.ini", QSettings::IniFormat);
	const auto selectedLocale = preferences.value("locale", config.settings["uiLocale"].toString("en")).toString();
	language->setCurrentIndex(selectedLocale == "es" ? 1 : 0);
	preferences.setValue("locale", selectedLocale);
	preferences.sync();
	config.settings["uiLocale"] = selectedLocale;
	locale->setLocale(language->currentData().toString());
	connect(language, &QComboBox::currentIndexChanged, this, [this, language, locale] {
		config.settings["uiLocale"] = language->currentData().toString();
		QSettings preferences(config.directory + "/ui-preferences.ini", QSettings::IniFormat);
		preferences.setValue("locale", language->currentData().toString());
		preferences.sync();
		locale->setLocale(language->currentData().toString());
		guarded([this] { config.save(); });
		updateStatus({});
	});
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
		projectDiagnostics->setText(uiTr(QString::fromUtf8(e.what())));
	}
}
void TikTokDock::refreshList()
{
	const auto previousRow = list->currentRow();
	list->clear();
	for (const auto &w : widgets.widgets)
		list->addItem(w.name() + " (" + w.type() + ")");
	if (list->count())
		list->setCurrentRow(qBound(0, previousRow, list->count() - 1));
}
void TikTokDock::connectRoom(bool forceReconnect)
{
	const auto requestedUsername = username->text().trimmed();
	if (requestedUsername.isEmpty() || requestedUsername == "@") {
		preparationError = "Enter a TikTok username first.";
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
	QSettings preferences(config.directory + "/ui-preferences.ini", QSettings::IniFormat);
	const auto selectedLocale = preferences.value("locale", "en").toString();
	if (uiLanguage && uiLocale && uiLanguage->currentData().toString() != selectedLocale) {
		const QSignalBlocker blocker(uiLanguage);
		uiLanguage->setCurrentIndex(selectedLocale == "es" ? 1 : 0);
		config.settings["uiLocale"] = selectedLocale;
		uiLocale->setLocale(selectedLocale);
	}
	auto s = connection.stateSnapshot();
	if (!widgets.restorationError.isEmpty())
		status->setToolTip(uiTr("Widget restore: ") + widgets.restorationError);
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
	QString text = preparing ? uiTr("Preparing connection… downloading and verifying setup files.")
				 : uiTr(s["data"].toObject()["state"].toString());
	if (!connection.getUsername().isEmpty())
		text += " · @" + connection.getUsername();
	const auto error = !preparationError.isEmpty() ? preparationError
						       : (bridgeError.isEmpty() ? connection.lastError() : bridgeError);
	if (!error.isEmpty())
		text += "\n" + uiTr(error);
	status->setText(text);
	const QLocale locale(config.settings["uiLocale"].toString("en"));
	diagnostics->setText(
		uiTr("%1 events/s · Received %2 · Delivered %3\nDropped %4 · Oversized %5 · Duplicates %6 · Delivery failures %7")
			.arg(locale.toString(eventsPerSecond, 'f', 1))
			.arg(locale.toString(static_cast<qulonglong>(stats.accepted)))
			.arg(locale.toString(static_cast<qulonglong>(stats.delivered)))
			.arg(locale.toString(static_cast<qulonglong>(stats.overflow)))
			.arg(locale.toString(static_cast<qulonglong>(stats.oversize)))
			.arg(locale.toString(static_cast<qulonglong>(stats.duplicate)))
			.arg(locale.toString(static_cast<qulonglong>(stats.failed))));
}
} // namespace tt

void tt::TikTokDock::projectState(const QString &id, const QString &state, const QString &diagnostic)
{
	projectDiagnostics->setText(id.left(8) + " · " + state +
				    (diagnostic.isEmpty() ? QString{} : "\n" + diagnostic));
	if (state == "published")
		refreshList();
}
