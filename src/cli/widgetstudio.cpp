#include "studio/StudioServer.hpp"
#include "projects/WidgetProjectWatcher.hpp"
#include <QCoreApplication>
#include <QJsonDocument>
#include <QTextStream>
#include <QStandardPaths>
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	auto a = app.arguments();
	if (!a.contains("--confirm")) {
		QTextStream(stdout)
			<< "Studio opens an authenticated local browser interface. Explicit --confirm is required.\n";
		return 2;
	}
	auto value = [&](QString key, QString fallback) {
		int i = a.indexOf(key);
		return i >= 0 && i + 1 < a.size() ? a[i + 1] : fallback;
	};
	try {
		tt::WidgetProjectService service(
			value("--config", QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) +
						  "/obs-studio/plugin_config/obs-tiktok-widgets"),
			value("--assets", QCoreApplication::applicationDirPath() + "/../../data/web"));
		tt::WidgetProjectWatcher watcher(service);
		tt::StudioServer server(service, service.assetDirectory());
		QTextStream(stdout) << QJsonDocument(tt::success(QJsonObject{{"url", server.start()}}))
					       .toJson(QJsonDocument::Compact)
				    << Qt::endl;
		return app.exec();
	} catch (const tt::DomainError &e) {
		QTextStream(stdout) << QJsonDocument(tt::failure(e)).toJson();
		return 4;
	}
}
