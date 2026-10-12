#include "TemplateRegistry.hpp"
#include <QDir>
#include <QDirIterator>
#include <QFileInfo>
#include <QTemporaryDir>
#include <QJsonDocument>
#include <QRegularExpression>
#include <algorithm>
#include <QSet>
namespace tt {
TemplateRegistry::TemplateRegistry(QString c, QString a) : assets(std::move(a)), config(std::move(c))
{
	discover();
}
QString TemplateRegistry::alias(const QString &id)
{
	static const QMap<QString, QString> a{{"gifts", "builtin.gift-alert"},    {"chat", "builtin.chat"},
					      {"alerts", "builtin.follow-alert"}, {"likes", "builtin.likes"},
					      {"viewers", "builtin.viewers"},     {"events", "builtin.events"},
					      {"custom", "builtin.custom"}};
	return a.value(id, id);
}
TemplateManifest TemplateRegistry::validate(const QString &root)
{
	const auto m = readObject(safePath(root, "manifest.json"));
	const auto id = m["id"].toString(), version = m["version"].toString();
	if (m["schemaVersion"].toInt() != 2 ||
	    !QRegularExpression("^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$").match(id).hasMatch() ||
	    !QRegularExpression(
		     "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$")
		     .match(version)
		     .hasMatch())
		throw DomainError("INVALID_MANIFEST", "Invalid schema, template id or semantic version");
	if (m["name"].toString().isEmpty() || !m["events"].isArray())
		throw DomainError("INVALID_MANIFEST", "Name and events array required");
	const auto prerelease = version.section('+', 0, 0).section('-', 1);
	for (const auto &part : prerelease.split('.'))
		if (part.size() > 1 && part.startsWith('0') && QRegularExpression("^[0-9]+$").match(part).hasMatch())
			throw DomainError("INVALID_MANIFEST",
					  "Numeric prerelease identifiers cannot have leading zeroes");
	const auto entry = m["entry"].toString();
	if (!entry.startsWith("src/") || !QFileInfo::exists(safePath(root, entry)))
		throw DomainError("MISSING_ENTRY", "Template entry must exist under src/");
	for (const auto &e : m["events"].toArray())
		if (!QStringList{"gift", "chat", "like", "follow", "roomUser", "unknown", "social", "state"}.contains(
			    e.toString()))
			throw DomainError("INVALID_MANIFEST", "Unsupported event name");
	QJsonObject schema;
	if (m.contains("configSchema"))
		schema = readObject(safePath(root, m["configSchema"].toString()));
	if (m.contains("thumbnail") && !QFileInfo::exists(safePath(root, m["thumbnail"].toString())))
		throw DomainError("MISSING_ASSET", "Template thumbnail missing");
	for (const auto &key : {"assets", "presets"})
		for (const auto &f : m[key].toArray())
			if (!QFileInfo::exists(safePath(root, f.toString())))
				throw DomainError("MISSING_ASSET", "Manifest resource missing: " + f.toString());
	const auto files = treeFiles(root);
	QSet<QString> portableNames;
	for (const auto &file : files) {
		const auto key = file.toCaseFolded();
		if (portableNames.contains(key))
			throw DomainError("INVALID_MANIFEST", "Case-colliding package paths");
		portableNames.insert(key);
		if (file != "manifest.json" && file != "checksums.json" && !file.startsWith("src/") &&
		    !file.startsWith("assets/") && !file.startsWith("schema/") && !file.startsWith("presets/"))
			throw DomainError("INVALID_MANIFEST", "File outside package allowlist: " + file);
	}
	const auto size = m["defaultSize"].toObject();
	if (size["width"].toInt() < 1 || size["height"].toInt() < 1 || size["width"].toInt() > 8192 ||
	    size["height"].toInt() > 8192)
		throw DomainError("INVALID_MANIFEST", "Invalid default dimensions");
	return {id, version, root, entry, m, schema};
}
void TemplateRegistry::discover()
{
	manifests.clear();
	diagnostics = {};
	for (const auto &root : {assets + "/templates", config + "/templates"}) {
		if (!QFileInfo::exists(root))
			continue;
		QDirIterator it(root, QStringList{"manifest.json"}, QDir::Files, QDirIterator::Subdirectories);
		while (it.hasNext()) {
			const auto file = it.next();
			try {
				auto m = validate(QFileInfo(file).absolutePath());
				if (QFileInfo(m.root).fileName() != m.version ||
				    QFileInfo(QFileInfo(m.root).absolutePath()).fileName() != m.id)
					throw DomainError("VERSION_MISMATCH",
							  "Template directory does not match pinned manifest identity");
				const auto key = m.id + "@" + m.version;
				if (manifests.contains(key))
					throw DomainError("DUPLICATE_TEMPLATE", "Duplicate template version: " + key);
				manifests.insert(key, m);
			} catch (const DomainError &e) {
				diagnostics.append(failure(e)["error"]);
			}
		}
	}
}
QJsonArray TemplateRegistry::list() const
{
	QJsonArray a;
	for (const auto &m : manifests)
		a.append(m.value);
	return a;
}
TemplateManifest TemplateRegistry::resolve(QString id, QString version) const
{
	id = alias(id);
	if (version.isEmpty()) { // Latest installed stable version; instances always pin this result.
		QList<TemplateManifest> choices;
		for (const auto &m : manifests)
			if (m.id == id && !m.version.contains('-'))
				choices << m;
		std::sort(choices.begin(), choices.end(), [](const auto &a, const auto &b) {
			const auto x = a.version.section('+', 0, 0).split('.'),
				   y = b.version.section('+', 0, 0).split('.');
			for (int i = 0; i < 3; i++) {
				if (x[i].size() != y[i].size())
					return x[i].size() < y[i].size();
				if (x[i] != y[i])
					return x[i] < y[i];
			}
			return false;
		});
		if (!choices.isEmpty())
			return choices.last();
	} else if (manifests.contains(id + "@" + version))
		return manifests[id + "@" + version];
	throw DomainError("TEMPLATE_NOT_FOUND", "Pinned template not installed: " + id + "@" + version);
}
TemplatePackageManager::TemplatePackageManager(QString c, TemplateRegistry &r) : config(std::move(c)), registry(r) {}
QJsonObject TemplatePackageManager::install(const QString &archive, bool dry)
{
	QTemporaryDir staging;
	importZip(archive, staging.path());
	auto m = TemplateRegistry::validate(staging.path());
	auto result = m.value;
	result["trustedAuthorCode"] = true;
	if (dry) {
		result["dryRun"] = true;
		return result;
	}
	ProjectLock lock(config);
	try {
		registry.resolve(m.id, m.version);
		throw DomainError("VERSION_EXISTS", "Installed versions are immutable");
	} catch (const DomainError &e) {
		if (e.code != "TEMPLATE_NOT_FOUND")
			throw;
	}
	const auto destination = safePath(config, "templates/" + m.id + "/" + m.version);
	if (QFileInfo::exists(destination))
		throw DomainError("VERSION_EXISTS", "Installed versions are immutable");
	const auto cache = safePath(config, "cache/template-install");
	QDir().mkpath(cache);
	QTemporaryDir installStaging(cache + "/install-XXXXXX");
	if (!installStaging.isValid())
		throw DomainError("FILE_WRITE", "Cannot stage package installation");
	const auto temporary = installStaging.path();
	copyTree(staging.path(), temporary);
	QDir().mkpath(QFileInfo(destination).absolutePath());
	if (!QDir().rename(temporary, destination))
		throw DomainError("FILE_WRITE", "Cannot commit template package");
	installStaging.setAutoRemove(false);
	registry.discover();
	return result;
}
void TemplatePackageManager::exportPackage(const TemplateManifest &m, const QString &out) const
{
	exportZip(m.root, out);
}
QJsonObject TemplatePackageManager::create(const QString &id, const TemplateManifest &source)
{
	ProjectLock lock(config);
	auto m = source.value;
	m["id"] = id;
	m["version"] = "1.0.0";
	QTemporaryDir staging;
	copyTree(source.root, staging.path());
	writeObject(staging.path() + "/manifest.json", m);
	auto checked = TemplateRegistry::validate(staging.path());
	const auto destination = safePath(config, "templates/" + checked.id + "/" + checked.version);
	if (QFileInfo::exists(destination))
		throw DomainError("VERSION_EXISTS", "Template exists");
	copyTree(staging.path(), destination);
	registry.discover();
	return m;
}
} // namespace tt
