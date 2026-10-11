#include "core/EventNormalizer.hpp"
#include "core/EventDispatcher.hpp"
#include <QCoreApplication>
#include <QJsonDocument>
#include <iostream>
#include <stdexcept>
using namespace tt;
static void check(bool value, const char *message)
{
	if (!value)
		throw std::runtime_error(message);
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	auto e = EventNormalizer::synthetic("chat");
	check(e["version"] == 1, "version");
	check(e["data"].toObject()["user"].toObject()["id"] == "9007199254740993", "integer precision");
	EventDispatcher queue(2);
	check(queue.push(e), "push");
	check(!queue.push(e), "dedup");
	check(queue.push(EventNormalizer::synthetic("unknown")), "unknown retained");
	check(!queue.push(EventNormalizer::synthetic("like")), "bounded queue");
	auto batch = queue.take();
	check(batch.size() == 2 && batch[0]["type"] == "chat" && batch[1]["type"] == "unknown", "FIFO");
	check(queue.snapshot().duplicate == 1 && queue.snapshot().overflow == 1, "diagnostics");
	auto *native = ttl_event_decode("UnrecognizedMethod", 18, UINT64_MAX, false, nullptr, 0);
	check(native != nullptr, "decode unknown");
	auto unknown = EventNormalizer::fromNative(native, "@fixture");
	ttl_event_free(native);
	check(unknown["messageId"] == "18446744073709551615", "native precision");
	check(unknown["type"] == "unknown", "unknown mapping");
	check(!EventNormalizer::isFollow({{"type", "social"}, {"data", QJsonObject{{"follow_count", "99"}}}}),
	      "social is not automatically follow");
	QJsonObject social{
		{"type", "social"},
		{"method", "WebcastSocialMessage"},
		{"native",
		 QJsonObject{{"data",
			      QJsonObject{{"common",
					   QJsonObject{{"displayText", QJsonObject{{"key", "pm_mt_msg_follow"}}}}}}}}}};
	check(EventNormalizer::isFollow(social), "identified follow display key");
	auto huge = EventNormalizer::synthetic("unknown", 999);
	huge["data"] = QJsonObject{{"payload", QString(1024 * 1024, 'x')}};
	check(!queue.push(huge) && queue.snapshot().oversize == 1, "payload bound diagnostics");
	for (int i = 0; i < 10000; ++i) {
		queue.push(EventNormalizer::synthetic("like", i));
		queue.take();
	}
	queue.shutdown();
	check(!queue.push(e), "shutdown");
	std::cout << "Event normalization, FIFO, precision, bounds, dedup, unknown and shutdown checks passed\n";
}
