#include "PluginLifecycle.hpp"
#include "core/PluginConfig.hpp"
#include "universal/ExternalEventReceiver.hpp"
#include "core/TikTokConnectionManager.hpp"
#include "widgets/WidgetManager.hpp"
#include "ui/TikTokDock.hpp"
#include "ui/EventMonitor.hpp"
#include "projects/WidgetProjectWatcher.hpp"
#include "projects/WidgetLocalIPC.hpp"
#include "obs/BrowserSourceManager.hpp"
#include "obs/OBSFrontendManager.hpp"
#include <obs-module.h>
#include <obs-websocket-api.h>
#include <QJsonDocument>
#include <obs-frontend-api.h>
#include <QTimer>
#include <QElapsedTimer>
#include <QScrollArea>
#include <QNetworkAccessManager>
#include <QFileInfo>
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
	eventReceiver = std::make_unique<ExternalEventReceiver>(dispatcher);
	eventReceiverOptions = config->settings["externalEvents"].toObject();
	if (!eventReceiver->start(eventReceiverOptions, [](const QJsonObject &record) {
		    blog(LOG_DEBUG, "[universal-widget] %s",
			 QJsonDocument(record).toJson(QJsonDocument::Compact).constData());
	    }))
		blog(LOG_WARNING,
		     "[universal-widget] External event receiver failed to bind; check loopback address and port");
	connection = std::make_unique<TikTokConnectionManager>(dispatcher);
	const auto snapshotPath = safePath(directory, "cache/migration-v1/obs-sources.json");
	if (!QFileInfo::exists(snapshotPath))
		writeObject(snapshotPath, {{"sources", BrowserSourceManager::sources()}});
	widgets = std::make_unique<WidgetManager>(directory, web);
	dock = new TikTokDock(*config, *connection, dispatcher, *widgets);
	projectWatcher = std::make_unique<WidgetProjectWatcher>(widgets->projects);
	connect(projectWatcher.get(), &WidgetProjectWatcher::publishedWidget, this, [this](const QString &id) {
		widgets->load();
		const auto m = widgets->projects.get(id);
		BrowserSourceManager::refresh(WidgetConfig{m["settings"].toObject()}, widgets->projects.outputPath(id));
	});
	connect(projectWatcher.get(), &WidgetProjectWatcher::stateChanged, dock,
		[this](const QString &id, const QString &state, const QString &diagnostic) {
			dock->projectState(id, state, diagnostic);
		});
	commands = std::make_unique<WidgetCommands>(widgets->projects);
	commands->obs = [this](const QString &method, const QJsonObject &a) -> QJsonValue {
		if (method == "obs.shutdown") {
			if (!a["confirm"].toBool())
				throw DomainError("CONFIRM_REQUIRED", "OBS shutdown requires --confirm");
			QTimer::singleShot(100, this, [] {
				if (auto *window = static_cast<QWidget *>(obs_frontend_get_main_window()))
					window->close();
			});
			return QJsonObject{{"shutdownRequested", true}};
		}
		if (method == "obs.status")
			return QJsonObject{{"running", true}, {"ipc", true}};
		if (method == "obs.scenes.list")
			return QJsonArray::fromStringList(OBSFrontendManager::scenes());
		if (method == "obs.sources.list")
			return BrowserSourceManager::sources();
		if (method == "obs.scenes.select") {
			auto *scene = obs_get_source_by_name(a["scene"].toString().toUtf8().constData());
			if (!scene || !obs_scene_from_source(scene)) {
				if (scene)
					obs_source_release(scene);
				throw DomainError("OBS_SCENE_NOT_FOUND", "Scene is unavailable");
			}
			obs_frontend_set_current_scene(scene);
			obs_source_release(scene);
			return QJsonObject{{"selected", a["scene"]}};
		}
		if (method == "obs.sources.capture") {
			const auto id = a["id"].toString();
			QString name = a["name"].toString();
			bool matched = false;
			for (const auto &value : BrowserSourceManager::sources()) {
				const auto source = value.toObject();
				if (source["id"] == id && (name.isEmpty() || name == source["name"].toString())) {
					name = source["name"].toString();
					matched = true;
					break;
				}
			}
			if (!matched)
				throw DomainError("OBS_SOURCE_NOT_FOUND", "Widget Browser Source is unavailable");
			auto *request = obs_data_create();
			obs_data_set_string(request, "sourceName", name.toUtf8().constData());
			obs_data_set_string(request, "imageFormat", "png");
			obs_data_set_int(request, "imageWidth", 600);
			obs_data_set_int(request, "imageHeight", 400);
			auto *response = obs_websocket_call_request("GetSourceScreenshot", request);
			obs_data_release(request);
			if (!response)
				throw DomainError("OBS_CAPTURE_UNAVAILABLE",
						  "In-process screenshot API is unavailable");
			const auto status = response->status_code;
			const auto result =
				QJsonDocument::fromJson(
					QByteArray(response->response_data ? response->response_data : "{}"))
					.object();
			obs_websocket_request_response_free(response);
			if (status != 100)
				throw DomainError("OBS_CAPTURE_FAILED", "Browser screenshot failed",
						  {{"status", static_cast<int>(status)}});
			return result;
		}
		const auto id = a["id"].toString();
		const auto m = widgets->projects.get(id);
		WidgetConfig w{m["settings"].toObject()};
		if (method == "obs.sources.add") {
			if (!BrowserSourceManager::add(w, widgets->materialize(w), a["scene"].toString()))
				throw DomainError("OBS_SOURCE_FAILED", "Cannot add Browser Source to selected scene");
		} else if (method == "obs.sources.refresh")
			BrowserSourceManager::refresh(w, widgets->materialize(w));
		else if (method == "obs.sources.remove") {
			if (!a["confirm"].toBool())
				throw DomainError("CONFIRM_REQUIRED", "Removing placement requires --confirm");
			BrowserSourceManager::remove(id, a["scene"].toString());
		}
		return QJsonObject{{"widgetId", id}, {"committed", true}};
	};
	ipc = std::make_unique<WidgetLocalIPC>(*commands, directory);
	ipc->start(config->settings["widgetctlEnabled"].toBool(false));
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
		if (eventReceiver && eventReceiverOptions != config->settings["externalEvents"].toObject()) {
			eventReceiverOptions = config->settings["externalEvents"].toObject();
			if (!eventReceiver->start(eventReceiverOptions))
				dock->projectState({}, "Receiver error", eventReceiver->errorString());
		}
		if (ipc && ipc->enabled() != config->settings["widgetctlEnabled"].toBool()) {
			try {
				if (config->settings["widgetctlEnabled"].toBool())
					ipc->start(true);
				else
					ipc->stop();
			} catch (const std::exception &e) {
				dock->projectState({}, "IPC error", QString::fromUtf8(e.what()));
			}
		}
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
	eventReceiver.reset();
	for (const auto &e : dispatcher.take(2048))
		dispatcher.delivered(bridge.broadcast(e));
	dispatcher.shutdown();
	if (dock) {
		for (auto *network : dock->findChildren<QNetworkAccessManager *>())
			delete network;
		obs_frontend_remove_dock("tiktok-live-widgets");
		dock = nullptr;
	}
	ipc.reset();
	commands.reset();
	projectWatcher.reset();
	widgets.reset();
	connection.reset();
	config.reset();
}
} // namespace tt
