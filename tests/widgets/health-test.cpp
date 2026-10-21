#include "widgets/WidgetHealthManager.hpp"
#include "widgets/WidgetDeliveryTracker.hpp"
#include <QCoreApplication>
#include <stdexcept>
using namespace tt;
static void check(bool ok)
{
	if (!ok)
		throw std::runtime_error("health invariant failed");
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	WidgetHealthManager h("session");
	auto p = QJsonObject{{"protocol", "widget-health/v1"}, {"sessionId", "session"}, {"widgetId", "widget"},
			     {"instanceId", "page-a"},         {"buildId", "build"},     {"kind", "loading"}};
	check(h.report(p, 0));
	p["kind"] = "ready";
	check(!h.report(p, 1)); // load is not mount
	p["data"] = QJsonObject{{"widgetMounted", true}};
	check(h.report(p, 2));
	p["instanceId"] = "page-b";
	check(h.report(p, 2));
	check(h.snapshot(2)["instances"].toArray().size() == 2);
	h.tick(16003);
	check(h.snapshot(16003)["instances"].toArray()[0].toObject()["runtime"] == "unresponsive");
	p["kind"] = "heartbeat";
	check(h.report(p, 16004));
	check(h.snapshot(16004)["instances"].toArray()[1].toObject()["runtime"] == "ready");
	p["kind"] = "pagehide";
	check(h.report(p, 16005));
	h.tick(50000);
	check(h.snapshot(50000)["instances"].toArray()[1].toObject()["runtime"] == "suspended");
	p["sessionId"] = "old";
	check(!h.report(p, 50001));
	h.vendorResult(true);
	check(!h.snapshot(50001)["visualVerified"].toBool());
	check(h.snapshot(50001)["telemetry"] == "reporting");
	WidgetHealthManager vendorOnly("separate");
	vendorOnly.vendorResult(true);
	check(vendorOnly.snapshot(0)["telemetry"] == "unobservable");
	WidgetDeliveryTracker tracker;
	for (int i = 0; i < 200; ++i)
		tracker.record({{"messageId", QString::number(i)}, {"data", QJsonObject{{"comment", "secret"}}}}, true);
	check(tracker.snapshot().size() == 100);
	check(!tracker.snapshot()[0].toObject().contains("data"));
	h.shutdown();
	check(!h.report(p, 60000));
}
