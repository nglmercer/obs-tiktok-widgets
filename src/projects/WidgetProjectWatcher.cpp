#include "WidgetProjectWatcher.hpp"
#include <QDateTime>
#include <QDirIterator>
#include <QFileInfo>
#include <QPointer>
#include <QJsonDocument>
namespace tt {
WidgetProjectWatcher::WidgetProjectWatcher(WidgetProjectService &s, QObject *p) : QObject(p), service(s)
{
	connect(&watcher, &QFileSystemWatcher::directoryChanged, this, [this] { scanSafely(); });
	connect(&watcher, &QFileSystemWatcher::fileChanged, this, [this] { scanSafely(); });
	connect(&poll, &QTimer::timeout, this, [this] { scanSafely(); });
	pool.setMaxThreadCount(1);
	poll.start(250);
	scanSafely();
}
WidgetProjectWatcher::~WidgetProjectWatcher()
{
	poll.stop();
	pool.waitForDone();
}
void WidgetProjectWatcher::setDebounce(int ms)
{
	debounce = qBound(200, ms, 2000);
}
void WidgetProjectWatcher::scanSafely()
{
	try {
		reconcile();
		scan();
	} catch (const std::exception &error) {
		emit stateChanged({}, "error", QString::fromUtf8(error.what()));
	}
}
void WidgetProjectWatcher::reconcile()
{
	QStringList paths;
	for (const auto &v : service.list()) {
		const auto m = v.toObject();
		if (m.contains("diagnostic"))
			continue;
		const auto id = m["id"].toString();
		for (const auto &part : {"src", "assets"}) {
			const auto root = service.projectPath(id) + "/" + part;
			if (!QFileInfo::exists(root))
				continue;
			paths << root;
			QDirIterator it(root, QDir::Dirs | QDir::NoDotAndDotDot, QDirIterator::Subdirectories);
			while (it.hasNext()) {
				const auto path = it.next();
				if (!it.fileInfo().isSymLink())
					paths << path;
			}
		}
	}
	const auto current = watcher.directories();
	for (const auto &p : current)
		if (!paths.contains(p))
			watcher.removePath(p);
	for (const auto &p : paths)
		if (!current.contains(p))
			watcher.addPath(p);
}
void WidgetProjectWatcher::scan()
{
	if (service.registry()["migrationRolledBack"].toBool())
		return;
	const auto now = QDateTime::currentMSecsSinceEpoch();
	for (const auto &v : service.list()) {
		const auto m = v.toObject();
		const auto id = m["id"].toString();
		if (m.contains("diagnostic")) {
			const auto value = m["diagnostic"];
			emit stateChanged(
				id, "error",
				value.isString()
					? value.toString()
					: QString::fromUtf8(
						  QJsonDocument(value.toObject()).toJson(QJsonDocument::Compact)));
			continue;
		}
		const auto hash = m["revision"].toString();
		if (!observed.contains(id)) {
			observed[id] = hash;
			const auto manifest = service.directory() + "/runtime/" + id + "/build-manifest.json";
			if (QFileInfo::exists(manifest))
				published[id] = readObject(manifest)["buildId"].toString();
			continue;
		}
		// Detect CLI publish even when source has not changed, then refresh matching sources.
		const auto manifest = service.directory() + "/runtime/" + id + "/build-manifest.json";
		if (QFileInfo::exists(manifest)) {
			const auto build = readObject(manifest)["buildId"].toString();
			if (published.value(id) != build) {
				published[id] = build;
				emit publishedWidget(id);
			}
		}
		if (observed[id] != hash) {
			observed[id] = hash;
			dirty[id] = now;
			emit stateChanged(id, "dirty", {});
			continue;
		}
		if (building.contains(id) || !dirty.contains(id) || now - dirty[id] < debounce)
			continue;
		dirty.remove(id);
		if (!m["autoPublish"].toBool(true) || !m["settings"].toObject()["autoPublish"].toBool(true))
			continue;
		building.insert(id);
		emit stateChanged(id, "validating", {});
		const auto root = service.directory(), assets = service.assetDirectory();
		QPointer<WidgetProjectWatcher> guard(this);
		pool.start([guard, root, assets, id, hash] {
			QJsonObject result;
			QString error;
			try {
				WidgetProjectService worker(root, assets);
				worker.validate(id);
				if (guard)
					QMetaObject::invokeMethod(
						guard,
						[guard, id] {
							if (guard)
								emit guard->stateChanged(id, "building", {});
						},
						Qt::QueuedConnection);
				result = worker.build(id, hash, true);
			} catch (const std::exception &e) {
				error = QString::fromUtf8(e.what());
			}
			if (guard)
				QMetaObject::invokeMethod(
					guard,
					[guard, id, result, error] {
						if (!guard)
							return;
						guard->building.remove(id);
						if (!error.isEmpty()) {
							emit guard->stateChanged(id, "error", error);
							return;
						}
						const auto revision = result["revision"].toString();
						// A directory notification can observe our own committed revision
						// before this callback. It must not schedule the same build again.
						if (guard->observed.value(id) == revision)
							guard->dirty.remove(id);
						guard->observed[id] = revision;
						const auto buildId = result["buildId"].toString();
						if (guard->published.value(id) != buildId) {
							guard->published[id] = buildId;
							emit guard->publishedWidget(id);
						}
						emit guard->stateChanged(id, "published", {});
					},
					Qt::QueuedConnection);
		});
	}
}
} // namespace tt
