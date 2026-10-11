#include "BrowserEventBridge.hpp"
#include "EventNormalizer.hpp"
#include <obs-module.h>
#include <obs-websocket-api.h>
#include <QJsonDocument>
#include <memory>
namespace tt {
using Data = std::unique_ptr<obs_data_t, decltype(&obs_data_release)>;
bool BrowserEventBridge::emitEvent(const QString &name, const QJsonObject &envelope)
{
	Data data(obs_data_create_from_json(QJsonDocument(envelope).toJson(QJsonDocument::Compact).constData()),
		  obs_data_release);
	Data nested(obs_data_create(), obs_data_release), request(obs_data_create(), obs_data_release);
	obs_data_set_string(nested.get(), "event_name", name.toUtf8().constData());
	obs_data_set_obj(nested.get(), "event_data", data.get());
	obs_data_set_string(request.get(), "vendorName", "obs-browser");
	obs_data_set_string(request.get(), "requestType", "emit_event");
	obs_data_set_obj(request.get(), "requestData", nested.get());
	std::unique_ptr<obs_websocket_request_response, decltype(&obs_websocket_request_response_free)> result(
		obs_websocket_call_request("CallVendorRequest", request.get()), obs_websocket_request_response_free);
	if (!result || result->status_code != 100) {
		error = QString("OBS Browser emit_event unavailable (status %1). Install compatible obs-browser and obs-websocket; no network server is required.")
				.arg(result ? result->status_code : 0);
		return false;
	}
	error.clear();
	return true;
}
bool BrowserEventBridge::verify()
{
	if (!obs_get_module("obs-browser")) {
		error = "OBS Browser module is missing";
		return false;
	}
	return emitEvent("tiktok:bridge-probe", {{"version", 1}});
}
bool BrowserEventBridge::broadcast(const QJsonObject &e)
{
	bool ok = emitEvent("tiktok:event", e);
	const auto type = e["type"].toString("unknown");
	ok = emitEvent("tiktok:" + type, e) && ok;
	if (type != "follow" && EventNormalizer::isFollow(e))
		ok = emitEvent("tiktok:follow", e) && ok;
	return ok;
}
} // namespace tt
