#include "core/BrowserEventBridge.hpp"
#include <obs.h>
#include <obs-websocket-api.h>
#include <QCoreApplication>
#include <QJsonDocument>
#include <stdexcept>
#include <iostream>
static proc_handler_t *vendor;
static int calls;
static void getHandler(void *, calldata_t *cd)
{
	calldata_set_ptr(cd, "ph", vendor);
}
static void call(void *, calldata_t *cd)
{
	auto json = QJsonDocument::fromJson(calldata_string(cd, "request_data")).object();
	if (QString::fromUtf8(calldata_string(cd, "request_type")) != "CallVendorRequest" ||
	    json["vendorName"] != "obs-browser" || json["requestType"] != "emit_event")
		throw std::runtime_error("request mismatch");
	auto nested = json["requestData"].toObject();
	if (!nested["event_data"].isObject())
		throw std::runtime_error("event_data must be parsed object");
	++calls;
	auto *response = static_cast<obs_websocket_request_response *>(bzalloc(sizeof(obs_websocket_request_response)));
	response->status_code = 100;
	calldata_set_ptr(cd, "response", response);
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	if (!obs_startup("en-US", nullptr, nullptr))
		return 1;
	tt::BrowserEventBridge bridge;
	if (bridge.emitEvent("tiktok:event", {{"version", 1}}))
		throw std::runtime_error("missing API must fail");
	vendor = proc_handler_create();
	proc_handler_add(vendor, "void call_request(string request_type, string request_data, out ptr response)", call,
			 nullptr);
	proc_handler_add(obs_get_proc_handler(), "void obs_websocket_api_get_ph(out ptr ph)", getHandler, nullptr);
	if (!bridge.broadcast(
		    {{"version", 1}, {"type", "gift"}, {"data", QJsonObject{{"gift_id", "9007199254740993"}}}}) ||
	    calls != 3)
		throw std::runtime_error("bridge failure");
	proc_handler_destroy(vendor);
	obs_shutdown();
	std::cout
		<< "In-process API request nesting and missing integration checks passed (mock vendor, not real CEF)\n";
}
