#include "studio/StudioServer.hpp"
#include "projects/WidgetProjectWatcher.hpp"
#include <QCoreApplication>
#include <QJsonDocument>
#include <QTextStream>
#include <QStandardPaths>
#include <QTimer>
#include <QFileInfo>
#ifdef Q_OS_WIN
#include <windows.h>
#else
#include <signal.h>
#include <errno.h>
#endif
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
	QTimer parentWatch;
	const auto parent = value("--parent-pid", {}).toLongLong();
	if (parent > 0) {
		QObject::connect(&parentWatch, &QTimer::timeout, &app, [&] {
#ifdef Q_OS_WIN
			HANDLE handle = OpenProcess(SYNCHRONIZE, FALSE, DWORD(parent));
			const bool alive = handle && WaitForSingleObject(handle, 0) == WAIT_TIMEOUT;
			if (handle)
				CloseHandle(handle);
#else
   const bool alive=kill(pid_t(parent),0)==0 || errno==EPERM;
#endif
			if (!alive)
				app.quit();
		});
		parentWatch.start(1000);
	}
	QString assets = QCoreApplication::applicationDirPath() + "/../share/obs/obs-plugins/obs-tiktok-widgets/web";
	for (const auto &candidate : QStringList{
		     QCoreApplication::applicationDirPath() + "/../../data/web",
		     QCoreApplication::applicationDirPath() + "/../obs-tiktok-widgets/data/web",
		     QCoreApplication::applicationDirPath() + "/../Resources/web",
		     QCoreApplication::applicationDirPath() + "/../obs-tiktok-widgets.plugin/Contents/Resources/web"})
		if (QFileInfo::exists(candidate + "/templates"))
			assets = candidate;
	try {
		tt::WidgetProjectService service(
			value("--config", QStandardPaths::writableLocation(QStandardPaths::GenericConfigLocation) +
						  "/obs-studio/plugin_config/obs-tiktok-widgets"),
			value("--assets", assets));
		tt::WidgetProjectWatcher watcher(service);
		tt::StudioServer server(service, service.assetDirectory());
		QTextStream(stdout) << QJsonDocument(tt::success(QJsonObject{{"url", server.start()}}))
					       .toJson(QJsonDocument::Compact)
				    << Qt::endl;
		return app.exec();
	} catch (const tt::DomainError &e) {
		QTextStream(stdout) << QJsonDocument(tt::failure(e)).toJson(QJsonDocument::Compact) << Qt::endl;
		return 4;
	}
}
