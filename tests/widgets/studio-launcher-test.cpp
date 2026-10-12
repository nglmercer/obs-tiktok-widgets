#include "ui/StudioLauncher.hpp"
#include "projects/WidgetBuilder.hpp"
#include <QCoreApplication>
#include <cstdlib>
#include <QElapsedTimer>
#include <QTextStream>
#include <QThread>
static void check(bool value)
{
	if (!value)
		std::abort();
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	check(tt::builderProvider({})->id() == "static");
	check(tt::builderProvider({{"mode", "vite"},
				   {"language", "typescript"},
				   {"framework", "react"},
				   {"target", "obs-browser"},
				   {"assetBase", "./"}})
		      ->id() == "vite-react");
	try {
		tt::builderProvider({{"mode", "untrusted"}});
		check(false);
	} catch (const tt::DomainError &e) {
		check(e.code == "UNSUPPORTED_BUILDER");
	}
	if (app.arguments().contains("--hang"))
		return app.exec();
	if (app.arguments().contains("--helper")) {
		QTextStream(stdout) << "{\"ok\":true,\"data\":{" << Qt::flush;
		QTimer::singleShot(40, [] {
			QTextStream(stdout) << "\"url\":\"http://127.0.0.1:1234/#private\"}}\n" << Qt::flush;
		});
		QTimer::singleShot(500, &app, &QCoreApplication::quit);
		return app.exec();
	}
	auto wait = [&](std::function<bool()> done) {
		QElapsedTimer timer;
		timer.start();
		while (!done() && timer.elapsed() < 3000) {
			app.processEvents();
			QThread::msleep(5);
		}
		check(done());
	};
	{
		tt::StudioLauncher running;
		int navigations = 0;
		running.navigate = [&](const QUrl &url) {
			++navigations;
			check(QUrlQuery(url).queryItemValue("widget") == "new-selection");
		};
		running.open(QCoreApplication::applicationFilePath(), {"--helper"}, "old-selection");
		running.open(QCoreApplication::applicationFilePath(), {"--helper"}, "new-selection");
		wait([&] { return running.state == tt::StudioLauncher::State::Ready; });
		check(navigations == 1);
		running.open("unused", {}, "new-selection");
		check(navigations == 2);
		wait([&] { return running.state == tt::StudioLauncher::State::Idle; });
	}
	{
		tt::StudioLauncher missing;
		missing.open("/missing/widgetstudio", {}, {});
		wait([&] { return missing.state == tt::StudioLauncher::State::Error; });
	}
	{
		tt::StudioLauncher timeout;
		timeout.open(QCoreApplication::applicationFilePath(), {"--hang"}, {}, 20);
		wait([&] { return timeout.state == tt::StudioLauncher::State::Error; });
	}
	tt::StudioLauncher launcher;
	int opened = 0;
	launcher.navigate = [&](const QUrl &url) {
		++opened;
		check(url.host() == "127.0.0.1");
	};
	launcher.state = tt::StudioLauncher::State::Starting;
	launcher.consume("{\"ok\":true,\"data\":{");
	check(opened == 0);
	launcher.consume("\"url\":\"http://127.0.0.1:1234/#private\"}}\n");
	check(opened == 1);
	launcher.consume("{\"ok\":true,\"data\":{\"url\":\"http://127.0.0.1:1234/#private\"}}\n");
	check(opened == 1);
	launcher.open("unused", {}, "uuid");
	check(opened == 2); // reuse, no new process
	tt::StudioLauncher invalid;
	invalid.state = tt::StudioLauncher::State::Starting;
	invalid.consume("{\"ok\":true,\"data\":{\"url\":\"https://example.com/#private\"}}\n");
	check(invalid.state == tt::StudioLauncher::State::Starting);
	invalid.consume(QByteArray(65537, 'x'));
	check(invalid.state == tt::StudioLauncher::State::Error);
}
