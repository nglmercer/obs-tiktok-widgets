#include "universal/ExternalEventReceiver.hpp"
#include <QCoreApplication>
#include <QTimer>
#include <QTextStream>
#include <QJsonArray>
#include <QJsonDocument>
// E2E transport harness: real native receiver and dispatcher, stdout delivery
// sink in place of the OBS vendor API. Never an installed application service.
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	tt::EventDispatcher dispatcher;
	tt::ExternalEventReceiver receiver(dispatcher);
	const auto token = qEnvironmentVariable("OBS_EVENT_TOKEN");
	if (token.size() < 32)
		return 2;
	QJsonObject producer{{"source", "external.e2e"},
			     {"token", token},
			     {"scopes", QJsonArray{"read", "publish"}},
			     {"types", QJsonArray{"custom.alert"}},
			     {"rateLimit", 600}};
	const auto port = qEnvironmentVariableIntValue("OBS_EVENT_PORT");
	if (!receiver.start({{"enabled", true}, {"port", port}, {"producers", QJsonArray{producer}}}))
		return 3;
	QTextStream(stdout) << "READY\n" << Qt::flush;
	QTimer timer;
	QObject::connect(&timer, &QTimer::timeout, &app, [&] {
		for (const auto &event : dispatcher.take())
			QTextStream(stdout) << QJsonDocument(event).toJson(QJsonDocument::Compact) << '\n' << Qt::flush;
	});
	timer.start(5);
	QTimer::singleShot(30000, &app, &QCoreApplication::quit);
	return app.exec();
}
