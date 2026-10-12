#include "widgets/WidgetManager.hpp"
#include "widgets/HtmlBootstrap.hpp"
#include "projects/WidgetProjectWatcher.hpp"
#include "projects/WidgetCommands.hpp"
#include "projects/WidgetLocalIPC.hpp"
#include <QCoreApplication>
#include <QTemporaryDir>
#include <QFileInfo>
#include <QDir>
#include <QJsonDocument>
#include <QLocalSocket>
#include <QElapsedTimer>
#include <QThread>
#include <QStandardPaths>
#include <QFile>
#include <iostream>
using namespace tt;
static void check(bool v, const char *m)
{
	if (!v)
		throw std::runtime_error(m);
}
static void error(const QString &code, const std::function<void()> &fn)
{
	try {
		fn();
	} catch (const DomainError &e) {
		check(e.code == code, "wrong error code");
		return;
	}
	throw std::runtime_error("expected rejection");
}
static void spin(int ms)
{
	QElapsedTimer timer;
	timer.start();
	while (timer.elapsed() < ms) {
		QCoreApplication::processEvents();
		QThread::msleep(10);
	}
}
static void until(const std::function<bool()> &condition)
{
	QElapsedTimer deadline;
	deadline.start();
	while (!condition() && deadline.elapsed() < 8000)
		spin(20);
	spin(300); // ensure bursts do not emit duplicate builds
}
int main(int argc, char **argv)
{
	QCoreApplication app(argc, argv);
	QTemporaryDir temp;
	WidgetManager manager(temp.path(), WIDGET_ASSETS);
	auto w = manager.create("gifts");
	manager.save();
	auto &service = manager.projects;
	const auto id = w.id();
	auto m = service.get(id);
	const auto sources = service.sourceHash(id);
	const auto output = manager.materialize(w);
	check(output == temp.path() + "/widgets/" + id + "/index.html", "stable path");
	auto first = readFile(output);
	manager.save();
	manager.materializePlayground(w);
	check(service.sourceHash(id) == sources, "generation changed source");
	const auto original = service.read(id, "src/index.html");
	auto edited = original;
	edited.replace("</main>", "Authored Unicode Ω</main>");
	auto revision = m["revision"].toString();
	m = service.write(id, "src/index.html", edited, revision);
	error("REVISION_CONFLICT", [&] { service.write(id, "src/index.html", original, revision); });
	service.build(id, m["revision"].toString(), true);
	check(readFile(output) != first, "publish pointer changes");
	const auto working = readFile(output);
	service.write(id, "src/main.js", "const broken = ;", m["revision"].toString());
	if (!QStandardPaths::findExecutable("node").isEmpty())
		error("JS_SYNTAX", [&] { service.build(id, {}, true); });
	check(readFile(output) == working, "failed build replaced output");
	service.rollback(id, m["revision"].toString(), service.get(id)["revision"].toString());
	service.build(id, {}, true);
	for (const auto &bad : {"../outside", "src/../../outside", "/etc/passwd", "src\\evil", "src/C:/evil"})
		error("UNSAFE_PATH", [&] { service.write(id, bad, "bad", {}); });
	QDir().mkpath(temp.path() + "/outside");
	if (QFile::link(temp.path() + "/outside", service.projectPath(id) + "/src/escape")) {
		error("UNSAFE_PATH", [&] { service.write(id, "src/escape/oops", "bad", {}); });
		QFile::remove(service.projectPath(id) + "/src/escape");
	}
	error("RESOURCE_LIMIT", [&] { service.write(id, "src/huge", QByteArray(8 * 1024 * 1024 + 1, 'x'), {}); });
	service.write(id, "src/style.css", "body {", {});
	error("CSS_SYNTAX", [&] { service.build(id, {}, true); });
	service.write(id, "src/style.css", readFile(QString(WIDGET_ASSETS) + "/widgets/widget.css"), {});
	service.write(id, "src/index.html", "<!doctype html><html><body><img src='missing.png'></body></html>", {});
	error("MISSING_ASSET", [&] { service.build(id, {}, true); });
	service.write(id, "src/index.html", edited, {});
	auto copy = service.duplicate(id);
	const auto copyId = copy["id"].toString();
	service.write(copyId, "src/style.css", "body {color:red}", copy["revision"].toString());
	check(service.read(id, "src/style.css") != service.read(copyId, "src/style.css"), "duplicate shares sources");
	const auto package = temp.path() + "/project.tiktokwidget";
	service.exportProject(id, package);
	auto importReport = service.importProject(package, true);
	check(importReport["idConflict"].toBool(), "import preview conflict");
	const auto imported = service.importProject(package);
	check(imported["id"] != id, "import conflict did not fork UUID");
	TemplatePackageManager packages(temp.path(), service.templates);
	const auto templateArchive = temp.path() + "/template.tiktokwidget";
	packages.exportPackage(service.templates.resolve("gifts"), templateArchive);
	check(packages.install(templateArchive, true)["dryRun"].toBool(), "template dry run");
	auto created = packages.create("user.rose", service.templates.resolve("gifts"));
	check(created["id"] == "user.rose", "template create");

#ifndef Q_OS_WIN
	const auto stagingCache = temp.path() + "/runtime/" + id + "/cache";
	const auto cachePermissions = QFile::permissions(stagingCache);
	const auto lastGood = readFile(output);
	QFile::setPermissions(stagingCache, QFileDevice::ReadOwner | QFileDevice::ExeOwner);
	bool denied = false;
	try {
		service.build(id, {}, true);
	} catch (const DomainError &e) {
		denied = e.code == "FILE_WRITE";
	}
	QFile::setPermissions(stagingCache, cachePermissions);
	check(denied && readFile(output) == lastGood, "permission failure replaced output");
#endif
	const auto custom = service.create("builtin.custom");
	const auto customId = custom["id"].toString();
	service.write(
		customId, "src/index.html",
		"<!DOCTYPE html>\r\n<!-- <head>fake</head> --><html><body>Ω<script>window.literal='\\u003c/script>';</script></body></html>",
		{});
	const auto utf8Source = service.read(customId, "src/index.html");
	QByteArray invalidEncoding("<!doctype html><html><body>");
	invalidEncoding.append(char(0xe9));
	invalidEncoding.append("</body></html>");
	service.write(customId, "src/index.html", invalidEncoding, {});
	error("UNSUPPORTED_ENCODING", [&] { service.build(customId, {}, true); });
	service.write(customId, "src/index.html", utf8Source, {});
	const auto build = service.build(customId, {}, true);
	check(readFile(build["release"].toString() + "/dist/src/index.html").startsWith("<!DOCTYPE html>\r\n"),
	      "doctype/crlf changed");
	const auto head =
		injectHtmlBootstrap("<!doctype html><html><HEAD data-x='>'></HEAD></html>", "<script>start()</script>");
	check(head.contains("data-x='>'><!-- tiktok-bootstrap -->"), "quoted head");
	check(htmlBaseHref("<!-- <base href='bad'> --><script>'<base href=bad>'</script><base href='nested/'>") ==
		      "nested/",
	      "base scanner");
	service.write(
		customId, "src/main.js",
		"// import './missing-comment.js';\nconst example=\"import './missing-string.js'\";const pattern=/import \"missing-regex.js\"/;",
		{});
	service.write(customId, "src/style.css",
		      "/* url(missing-comment.png) */ body::after {content:\"url(missing-string.png)\";}", {});
	service.validate(customId);
	const auto markerLiteral = QByteArray(
		"<!doctype html><html><head><script>window.literal='<!-- tiktok-bootstrap -->keep<!-- /tiktok-bootstrap -->';</script></head></html>");
	const auto injectedLiteral =
		injectHtmlBootstrap(markerLiteral, "<script>window.bootstrap=true;</script>", false);
	check(injectedLiteral.contains("-->keep<!--"), "bootstrap stripped an author script literal");
	check(injectHtmlBootstrap(injectedLiteral, "<script>window.bootstrap=true;</script>", false) == injectedLiteral,
	      "bootstrap is not idempotent");
	int published = 0, failures = 0;
	WidgetProjectWatcher watcher(service);
	QObject::connect(&watcher, &WidgetProjectWatcher::publishedWidget, [&](const QString &i) {
		if (i == id)
			published++;
	});
	QObject::connect(&watcher, &WidgetProjectWatcher::stateChanged, [&](QString i, QString state, QString) {
		if (i == id && state == "error")
			failures++;
	});
	spin(200);
	const auto stylePath = service.projectPath(id) + "/src/style.css";
	atomicWrite(stylePath, "body {color:rgb(12,34,56)}\r\n");
	spin(150);
	atomicWrite(stylePath, "body {color:rgb(12,34,57)}\r\n");
	until([&] { return published >= 1; });
	check(published == 1, "atomic save debounce");
	atomicWrite(stylePath, "body {");
	until([&] { return failures >= 1; });
	check(failures == 1 && published == 1, "watcher failure replaces output");
	atomicWrite(stylePath, "body {color:green}");
	until([&] { return published >= 2; });
	check(published == 2, "watcher recovery");
	WidgetCommands commands(service);
	error("OBS_OFFLINE", [&] { commands.execute("obs.scenes.list", {}); });
	commands.obs = [](const QString &method, const QJsonObject &) -> QJsonValue {
		return QJsonObject{{"method", method}, {"committed", true}};
	};
	WidgetLocalIPC ipc(commands, temp.path());
	check(!ipc.start(false), "IPC default opt out");
	check(ipc.start(true), "IPC start");
	auto state = readObject(temp.path() + "/cache/ipc.json");
	QLocalSocket socket;
	socket.connectToServer(state["socket"].toString());
	check(socket.waitForConnected(1000), "local IPC connect");
	socket.write(QJsonDocument(QJsonObject{{"apiVersion", 1},
					       {"token", "unauthorized"},
					       {"method", "obs.status"},
					       {"args", QJsonObject{}}})
			     .toJson(QJsonDocument::Compact) +
		     '\n');
	socket.flush();
	spin(100);
	check(QJsonDocument::fromJson(socket.readAll()).object()["error"].toObject()["code"] == "UNAUTHORIZED",
	      "IPC auth");

	auto requestIPC = [&](const QString &method, const QString &token) {
		QLocalSocket client;
		client.connectToServer(state["socket"].toString());
		check(client.waitForConnected(1000), "authenticated IPC connect");
		client.write(QJsonDocument(QJsonObject{{"apiVersion", 1},
						       {"token", token},
						       {"method", method},
						       {"args", QJsonObject{}}})
				     .toJson(QJsonDocument::Compact) +
			     '\n');
		client.flush();
		spin(100);
		return QJsonDocument::fromJson(client.readAll()).object();
	};
	for (const auto &method : QStringList{"obs.status", "obs.scenes.list", "obs.sources.list", "obs.sources.add",
					      "obs.sources.refresh", "obs.sources.remove"})
		check(requestIPC(method, state["token"].toString())["ok"].toBool(), "authenticated placement API");
	check(requestIPC("widgets.delete", state["token"].toString())["error"].toObject()["code"] == "METHOD_DENIED",
	      "IPC author method allowlist");
	check(requestIPC("obs.unknown", state["token"].toString())["error"].toObject()["code"] == "UNKNOWN_METHOD",
	      "IPC unknown method");
	ipc.stop();
	WidgetManager restarted(temp.path(), WIDGET_ASSETS);
	check(restarted.projects.read(id, "src/index.html") == edited, "restart source loss");
	const auto preview = manager.materializePlayground(w);
	manager.erase(id);
	check(QFileInfo::exists(service.projectPath(id) + "/src/index.html"), "delete destroyed author source");
	check(!QFileInfo::exists(QFileInfo(preview).absolutePath()), "preview cleanup");
	check(QFileInfo::exists(service.projectPath(copyId)), "unrelated project removed");
	// Legacy fixture with external HTML and nested resources. Only referenced files are imported.
	QTemporaryDir legacy;
	QDir().mkpath(legacy.path() + "/author/nested");
	atomicWrite(
		legacy.path() + "/author/page.html",
		"<!doctype html><html><body><p id='asset'>Custom</p><img src='image.svg'><link rel='stylesheet' href='nested/style.css'><script src='nested/code.js'></script></body></html>");
	atomicWrite(legacy.path() + "/author/nested/style.css", "#asset {color:rgb(12,34,56)}");
	atomicWrite(legacy.path() + "/author/nested/code.js", "window.customAssetLoaded=true;");
	atomicWrite(
		legacy.path() + "/author/image.svg",
		"<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><rect width='10' height='10' fill='red'/></svg>");
	auto old = WidgetConfig::create("custom");
	old.value["customHtml"] = legacy.path() + "/author/page.html";
	const auto oldBytes = readFile(old.value["customHtml"].toString());
	atomicWrite(legacy.path() + "/widgets.json", QJsonDocument(QJsonArray{old.value}).toJson());
	auto legacyPage = oldBytes;
	legacyPage.replace("<body>", "<body><script src='config.js'></script>");
	atomicWrite(old.value["customHtml"].toString(), legacyPage);
	atomicWrite(legacy.path() + "/author/config.js", "window.TikTokWidgetConfig={\"color\":\"#123456\"};\n");
	WidgetManager migrated(legacy.path(), WIDGET_ASSETS);
	check(migrated.widgets.first().id() == old.id(), "migration UUID");
	check(readFile(old.value["customHtml"].toString()) == legacyPage, "migration changed external source");
	check(QFileInfo::exists(legacy.path() + "/cache/migration-v1/widgets.json"), "migration backup");
	check(migrated.projects.get(old.id())["settings"].toObject()["color"] == "#123456",
	      "legacy config edits lost during migration");
	auto generated = migrated.projects.build(old.id(), {}, true);
	check(!readFile(generated["release"].toString() + "/dist/src/page.html").contains("src='config.js'"),
	      "recognized legacy config duplicated");
	migrated.projects.write(old.id(), "src/config.js", "window.TikTokWidgetConfig={};window.authorConfigCode=true;",
				{});
	generated = migrated.projects.build(old.id(), {}, true);
	check(readFile(generated["release"].toString() + "/dist/src/page.html").contains("src='config.js'"),
	      "edited config.js was silently removed");

	check(migrated.projects.migration(QJsonArray{old.value}, true)["items"].toArray().first().toObject()["status"] ==
		      "already-migrated",
	      "migration idempotence");

	QTemporaryDir failedLegacy;
	auto failedWidget = WidgetConfig::create("custom");
	const auto failedOutput = failedLegacy.path() + "/widgets/" + failedWidget.id() + "/index.html";
	atomicWrite(failedOutput, "<!doctype html><html><body>Legacy retained<img src='lost.png'></body></html>");
	const auto failedOriginal = readFile(failedOutput);
	atomicWrite(failedLegacy.path() + "/widgets.json", QJsonDocument(QJsonArray{failedWidget.value}).toJson());
	WidgetManager failedMigration(failedLegacy.path(), WIDGET_ASSETS);
	check(readFile(failedOutput) == failedOriginal, "failed migration overwrote live output");
	check(!QFileInfo::exists(failedMigration.projects.projectPath(failedWidget.id()) + "/project.json"),
	      "failed migration substituted default project");
	migrated.projects.restoreMigration(false);
	WidgetManager rolledBack(legacy.path(), WIDGET_ASSETS);
	check(rolledBack.widgets.first().id() == old.id(), "migration rollback lost identity");
	check(readFile(old.value["customHtml"].toString()) == legacyPage, "rollback touched external HTML");
	atomicWrite(temp.path() + "/bad.json", "{ invalid");
	error("INVALID_JSON", [&] { readObject(temp.path() + "/bad.json"); });
	const auto badManifestRoot = temp.path() + "/invalid-template";
	copyTree(service.templates.resolve("gifts").root, badManifestRoot);
	auto invalidManifest = readObject(badManifestRoot + "/manifest.json");
	invalidManifest["version"] = "2.01.0";
	writeObject(badManifestRoot + "/manifest.json", invalidManifest);
	error("INVALID_MANIFEST", [&] { TemplateRegistry::validate(badManifestRoot); });
	const auto fixtureRoot = qEnvironmentVariable("PLAYGROUND_FIXTURE_DIR");
	if (!fixtureRoot.isEmpty()) {
		WidgetManager fixtures(fixtureRoot, WIDGET_ASSETS);
		auto customWidget = fixtures.create("custom");
		const auto fid = customWidget.id();
		for (const auto &file :
		     QStringList{"page.html", "config.js", "image.svg", "nested/style.css", "nested/code.js"})
			fixtures.projects.write(fid, "src/" + file, readFile(legacy.path() + "/author/" + file), {});
		auto metadata = readObject(fixtures.projects.projectPath(fid) + "/project.json");
		metadata["entry"] = "src/page.html";
		writeObject(fixtures.projects.projectPath(fid) + "/project.json", metadata);
		fixtures.publish(fid);
		atomicWrite(fixtureRoot + "/preview-path.txt", fixtures.materializePlayground(customWidget).toUtf8());
		auto builtin = fixtures.create("gifts");
		fixtures.publish(builtin.id());
		atomicWrite(fixtureRoot + "/builtin-path.txt", fixtures.materializePlayground(builtin).toUtf8());
		atomicWrite(fixtureRoot + "/custom-id.txt", fid.toUtf8());
	}
	std::cout << "Projects, publishing, migration, watcher, revisions, packages and IPC passed\n";
}
