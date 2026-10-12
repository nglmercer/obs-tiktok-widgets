#include "WidgetProjectService.hpp"
#include "WidgetBuilder.hpp"
#include "widgets/WidgetConfig.hpp"
#include "widgets/HtmlBootstrap.hpp"
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QDateTime>
#include <QTemporaryDir>
#include <QProcess>
#include <QStandardPaths>
#include <QRegularExpression>
#include <QUuid>
#include <QUrl>
#include <QtMath>
#include <QSet>
#include <QTemporaryFile>
#include <QCryptographicHash>
namespace tt {
namespace {
QStringList sourceFiles(const QString &path)
{
	QStringList a;
	for (const auto &prefix : {"src", "assets", "presets"})
		if (QFileInfo::exists(path + "/" + prefix))
			for (const auto &f : treeFiles(path + "/" + prefix))
				a << QString(prefix) + "/" + f;
	a.sort();
	return a;
}
QString relativeUrl(const QString &from, const QString &to)
{
	QUrl url;
	url.setPath(QDir(QFileInfo(from).absolutePath()).relativeFilePath(to));
	return url.toString(QUrl::FullyEncoded);
}
QString htmlLoader(const QString &path, const QString &previewPath = {}, bool forcePreview = false,
		   const QString &buildId = {}, const QString &from = {})
{
	return "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"tiktok-build\" content=\"" +
	       buildId.toHtmlEscaped() + "\"><script>const incoming=new URL(location.href);const target=new URL(" +
	       jsonString(relativeUrl(from, path)) + ",location.href);" +
	       (forcePreview ? "target.searchParams.set('__playground','1');" : "") +
	       (!previewPath.isEmpty() ? "if(incoming.searchParams.has('__playground'))target.href=new URL(" +
						 jsonString(relativeUrl(from, previewPath)) + ",location.href).href;"
				       : "") +
	       "for(const [key,value] of incoming.searchParams)target.searchParams.set(key,value);target.hash=location.hash;location.replace(target.href);</script></head><body>Loading widget…</body></html>";
}
// Classify lexical code/comments without interpreting or transforming author code.
// Resource regexes run only at code positions; strings and comments are preserved.
QByteArray codeMask(const QString &text, bool javascript)
{
	QByteArray mask(text.size(), '1');
	QChar quote;
	bool block = false, line = false, regex = false, inClass = false;
	QChar previous;
	QString word;
	for (int i = 0; i < text.size(); ++i) {
		const auto c = text[i], next = i + 1 < text.size() ? text[i + 1] : QChar{};
		if (block) {
			mask[i] = '2';
			if (c == '*' && next == '/') {
				mask[++i] = '2';
				block = false;
			}
			continue;
		}
		if (line) {
			mask[i] = '2';
			if (c == '\n' || c == '\r')
				line = false;
			continue;
		}
		if (!quote.isNull()) {
			mask[i] = '0';
			if (c == '\\' && i + 1 < text.size())
				mask[++i] = '0';
			else if (c == quote)
				quote = {};
			continue;
		}
		if (regex) {
			mask[i] = '0';
			if (c == '\\' && i + 1 < text.size())
				mask[++i] = '0';
			else if (c == '[')
				inClass = true;
			else if (c == ']')
				inClass = false;
			else if (c == '/' && !inClass) {
				regex = false;
				previous = '/';
			}
			continue;
		}
		if (c == '/' && next == '*') {
			mask[i] = mask[i + 1] = '2';
			++i;
			block = true;
			continue;
		}
		if (javascript && c == '/' && next == '/') {
			mask[i] = mask[i + 1] = '2';
			++i;
			line = true;
			continue;
		}
		if (c == '\'' || c == '"' || (javascript && c == '`')) {
			mask[i] = '0';
			quote = c;
			previous = c;
			word.clear();
			continue;
		}
		if (javascript && c == '/' &&
		    (previous.isNull() || QString("=(:,!;?[{&|}").contains(previous) ||
		     QStringList{"return", "throw", "case", "yield"}.contains(word))) {
			mask[i] = '0';
			regex = true;
			word.clear();
			continue;
		}
		if (c.isLetterOrNumber() || c == '_' || c == '$') {
			word += c;
			previous = c;
		} else if (!c.isSpace()) {
			word.clear();
			previous = c;
		}
	}
	return mask;
}
void validateSettings(const QJsonObject &settings, const QJsonObject &schema)
{
	const auto props = schema["properties"].toObject();
	for (auto it = props.begin(); it != props.end(); ++it) {
		if (!settings.contains(it.key()))
			continue;
		const auto v = settings[it.key()];
		const auto rule = it.value().toObject();
		const auto type = rule["type"].toString();
		bool ok = true;
		if (type == "string")
			ok = v.isString();
		else if (type == "boolean")
			ok = v.isBool();
		else if (type == "integer")
			ok = v.isDouble() && v.toDouble() == qFloor(v.toDouble());
		else if (type == "number")
			ok = v.isDouble();
		else if (type == "array")
			ok = v.isArray();
		else if (type == "object")
			ok = v.isObject();
		if (!ok)
			throw DomainError("SETTINGS_INVALID", "Invalid type for " + it.key(), {{"field", it.key()}});
		if (rule.contains("enum") && !rule["enum"].toArray().contains(v))
			throw DomainError("SETTINGS_INVALID", "Invalid choice for " + it.key(), {{"field", it.key()}});
		if (v.isDouble() && ((rule.contains("minimum") && v.toDouble() < rule["minimum"].toDouble()) ||
				     (rule.contains("maximum") && v.toDouble() > rule["maximum"].toDouble())))
			throw DomainError("SETTINGS_INVALID", "Out of range: " + it.key(), {{"field", it.key()}});
	}
	for (const auto &r : schema["required"].toArray())
		if (!settings.contains(r.toString()))
			throw DomainError("SETTINGS_INVALID", "Missing required setting", {{"field", r.toString()}});
}
void syntaxCheck(const QString &path, const QString &node)
{
	if (node.isEmpty())
		return;
	QProcess p;
	p.start(node, {"--check", path});
	if (!p.waitForFinished(5000)) {
		p.kill();
		p.waitForFinished();
		throw DomainError("VALIDATION_TIMEOUT", "JavaScript check timed out");
	}
	if (p.exitCode() != 0)
		throw DomainError("JS_SYNTAX", QString::fromUtf8(p.readAllStandardError()));
}
void cssCheck(const QString &text)
{
	int braces = 0;
	QChar quote;
	bool comment = false, escape = false;
	for (int i = 0; i < text.size(); ++i) {
		const auto c = text[i];
		if (comment) {
			if (c == '*' && i + 1 < text.size() && text[i + 1] == '/') {
				comment = false;
				++i;
			}
			continue;
		}
		if (!quote.isNull()) {
			if (escape) {
				escape = false;
				continue;
			}
			if (c == '\\') {
				escape = true;
				continue;
			}
			if (c == quote)
				quote = {};
			continue;
		}
		if (c == '/' && i + 1 < text.size() && text[i + 1] == '*') {
			comment = true;
			++i;
			continue;
		}
		if (c == '\'' || c == '"') {
			quote = c;
			continue;
		}
		if (c == '{')
			++braces;
		if (c == '}' && --braces < 0)
			throw DomainError("CSS_SYNTAX", "Unmatched CSS closing brace");
	}
	if (braces || comment || !quote.isNull())
		throw DomainError("CSS_SYNTAX", "Unclosed CSS block/string/comment");
}
} // namespace
WidgetProjectService::WidgetProjectService(QString r, QString a)
	: root(std::move(r)),
	  assets(std::move(a)),
	  templates(root, assets)
{
	safePath(root, "registry.json");
	QDir().mkpath(root);
}
QString WidgetProjectService::projectPath(const QString &id) const
{
	validateUuid(id);
	return safePath(root, "projects/" + id);
}
QString WidgetProjectService::outputPath(const QString &id) const
{
	validateUuid(id);
	return safePath(root, "widgets/" + id + "/index.html");
}
QJsonObject WidgetProjectService::registry() const
{
	const auto path = safePath(root, "registry.json");
	return QFileInfo::exists(path) ? readObject(path)
				       : QJsonObject{{"schemaVersion", 2}, {"widgets", QJsonArray{}}};
}
QJsonArray WidgetProjectService::list() const
{
	QJsonArray a;
	for (const auto &v : registry()["widgets"].toArray()) {
		const auto o = v.toObject();
		if (o["deleted"].toBool())
			continue;
		try {
			a.append(get(o["id"].toString()));
		} catch (const DomainError &e) {
			auto missing = o;
			missing["diagnostic"] = failure(e)["error"];
			a.append(missing);
		}
	}
	QSet<QString> known;
	for (const auto &record : registry()["widgets"].toArray())
		known.insert(record.toObject()["id"].toString());
	for (const auto &legacy : registry()["legacyRecords"].toArray()) {
		const auto record = legacy.toObject();
		const auto id = record["id"].toString();
		if (!known.contains(id))
			a.append(QJsonObject{
				{"id", id},
				{"settings", record},
				{"legacy", true},
				{"diagnostic",
				 QJsonObject{
					 {"code", "MIGRATION_REQUIRED"},
					 {"message",
					  "Legacy instance remains operational; resolve its template/resources and run migration apply"}}}});
	}
	return a;
}
QString WidgetProjectService::sourceHash(const QString &id) const
{
	const auto path = projectPath(id);
	return contentHash(path, sourceFiles(path));
}
QJsonObject WidgetProjectService::get(const QString &id) const
{
	auto m = readObject(projectPath(id) + "/project.json");
	if (m["id"] != id || m["schemaVersion"].toInt() != 2)
		throw DomainError("INVALID_PROJECT", "Project identity mismatch");
	if (m.contains("migrationError"))
		m["diagnostic"] = m["migrationError"];
	m["sourceHash"] = sourceHash(id);
	m["revision"] = QString::number(m["counter"].toInt()) + "-" +
			contentHash(projectPath(id), QStringList{"project.json"} + sourceFiles(projectPath(id)));
	m["sourceDirectory"] = projectPath(id) + "/src";
	m["output"] = outputPath(id);
	return m;
}
void WidgetProjectService::checkRevision(const QString &id, const QString &expected) const
{
	if (!expected.isEmpty() && get(id)["revision"].toString() != expected)
		throw DomainError("REVISION_CONFLICT", "Project changed since it was read",
				  {{"current", get(id)["revision"]}});
}
void WidgetProjectService::snapshot(const QString &id, const QJsonObject &m) const
{
	const auto token = get(id)["revision"].toString();
	const auto dir = projectPath(id) + "/.history/" + token;
	if (QFileInfo::exists(dir + "/project.json"))
		return;
	for (const auto &f : sourceFiles(projectPath(id)))
		atomicWrite(safePath(dir, f), readFile(safePath(projectPath(id), f)));
	writeObject(dir + "/project.json", m);
}
void WidgetProjectService::commitProject(const QString &id, QJsonObject m) const
{
	m["counter"] = m["counter"].toInt() + 1;
	m["lastSourceHash"] = sourceHash(id);
	m.remove("revision");
	m.remove("sourceHash");
	m.remove("sourceDirectory");
	m.remove("output");
	writeObject(projectPath(id) + "/project.json", m);
}
QJsonObject WidgetProjectService::create(QString tid, QString name, QString version, QString id)
{
	ProjectLock lock(root);
	const auto t = templates.resolve(tid, version);
	if (t.value["build"].toObject()["mode"].toString("static") != "static")
		throw DomainError("DEVELOPMENT_ONLY", "New user widgets support plain HTML/CSS/JavaScript only. Import a precompiled static template instead.");
	if (id.isEmpty())
		id = QUuid::createUuid().toString(QUuid::WithoutBraces);
	const auto path = projectPath(id);
	if (QFileInfo::exists(path))
		throw DomainError("ID_CONFLICT", "Widget project exists");
	QJsonObject config;
	const auto props = t.schema["properties"].toObject();
	for (auto it = props.begin(); it != props.end(); ++it)
		if (it.value().toObject().contains("default"))
			config[it.key()] = it.value().toObject()["default"];
	if (!config.contains("width"))
		config["width"] = t.value["defaultSize"].toObject()["width"];
	if (!config.contains("height"))
		config["height"] = t.value["defaultSize"].toObject()["height"];
	config["id"] = id;
	config["template"] = tid;
	config["name"] = name.isEmpty() ? t.value["name"].toString() : name;
	QTemporaryDir staging(safePath(root, "cache") + "-create-XXXXXX");
	if (!staging.isValid())
		throw DomainError("FILE_WRITE", "Cannot stage project");
	for (const auto &prefix : {"src", "assets", "presets", "schema"})
		if (QFileInfo::exists(t.root + "/" + prefix))
			copyTree(t.root + "/" + prefix, staging.path() + "/" + prefix);
	QJsonObject m{{"schemaVersion", 2},
		      {"id", id},
		      {"counter", 1},
		      {"template", QJsonObject{{"id", t.id}, {"version", t.version}}},
		      {"entry", t.entry},
		      {"events", t.value["events"]},
		      {"settings", config},
		      {"autoPublish", t.value["build"].toObject().isEmpty()},
		      {"build", t.value["build"].toObject()}};
	m["lastSourceHash"] = contentHash(staging.path(), sourceFiles(staging.path()));
	writeObject(staging.path() + "/project.json", m);
	QDir().mkpath(QFileInfo(path).absolutePath());
	if (!QDir().rename(staging.path(), path))
		throw DomainError("FILE_WRITE", "Cannot initialize project");
	staging.setAutoRemove(false);
	auto reg = registry();
	auto a = reg["widgets"].toArray();
	a.append(QJsonObject{{"id", id}});
	reg["widgets"] = a;
	writeObject(root + "/registry.json", reg);
	return get(id);
}
QJsonObject WidgetProjectService::duplicate(const QString &id, const QString &expected)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	auto m = get(id);
	const auto newId = QUuid::createUuid().toString(QUuid::WithoutBraces);
	const auto path = projectPath(newId);
	for (const auto &f : sourceFiles(projectPath(id)))
		atomicWrite(safePath(path, f), readFile(safePath(projectPath(id), f)));
	if (QFileInfo::exists(projectPath(id) + "/schema"))
		copyTree(projectPath(id) + "/schema", path + "/schema");
	m["id"] = newId;
	m["counter"] = 0;
	auto settings = m["settings"].toObject();
	settings["id"] = newId;
	settings["name"] = settings["name"].toString() + " copy";
	m["settings"] = settings;
	commitProject(newId, m);
	auto reg = registry();
	auto a = reg["widgets"].toArray();
	a.append(QJsonObject{{"id", newId}});
	reg["widgets"] = a;
	writeObject(root + "/registry.json", reg);
	return get(newId);
}
QJsonObject WidgetProjectService::erase(const QString &id, const QString &expected, bool dry)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	auto m = get(id);
	m["deleted"] = true;
	m["sourcesRetained"] = true;
	if (dry) {
		m["dryRun"] = true;
		return m;
	}
	snapshot(id, m);
	commitProject(id, m);
	auto reg = registry();
	auto a = reg["widgets"].toArray();
	for (int i = 0; i < a.size(); ++i) {
		auto o = a[i].toObject();
		if (o["id"] == id) {
			o["deleted"] = true;
			a[i] = o;
		}
	}
	reg["widgets"] = a;
	writeObject(root + "/registry.json", reg);
	const auto previewDirectory = safePath(root, "playground/" + id);
	if (QFileInfo::exists(previewDirectory)) {
		treeFiles(previewDirectory);
		if (!QDir(previewDirectory).removeRecursively())
			throw DomainError("FILE_WRITE", "Widget is tombstoned, but generated preview cleanup failed");
	}
	return get(id);
}
QJsonObject WidgetProjectService::configure(const QString &id, QJsonObject patch, const QString &expected)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	auto m = get(id);
	for (auto it = patch.begin(); it != patch.end(); ++it) {
		if (!QStringList{"entry", "events", "autoPublish", "build"}.contains(it.key()))
			throw DomainError("IMMUTABLE_FIELD",
					  "Only entry/events/autoPublish project options are configurable");
		m[it.key()] = it.value();
	}
	validateBuildMode(m["build"].toObject());
	const auto entry = m["entry"].toString();
	if (!entry.startsWith("src/") || !QFileInfo(safePath(projectPath(id), entry)).isFile())
		throw DomainError("MISSING_ENTRY", "Entry must be an existing project source file");
	if (!m["events"].isArray() || !m["autoPublish"].isBool())
		throw DomainError("INVALID_PROJECT", "Events must be an array; autoPublish must be boolean");
	for (const auto &event : m["events"].toArray())
		if (!QStringList{"gift", "chat", "like", "follow", "roomUser", "state", "unknown", "social"}.contains(
			    event.toString()))
			throw DomainError("INVALID_PROJECT", "Unknown declared event type");
	snapshot(id, get(id));
	commitProject(id, m);
	return get(id);
}
QJsonObject WidgetProjectService::settings(const QString &id, QJsonObject patch, const QString &expected)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	auto m = get(id);
	auto config = m["settings"].toObject();
	for (auto it = patch.begin(); it != patch.end(); ++it) {
		if (it.key() == "id" || it.key() == "template" || it.key() == "editableHtml" ||
		    it.key() == "customHtml")
			throw DomainError("IMMUTABLE_FIELD",
					  "Identity and legacy references cannot be changed by settings");
		config[it.key()] = it.value();
	}
	const auto schemaPath = projectPath(id) + "/schema/settings.schema.json";
	if (QFileInfo::exists(schemaPath))
		validateSettings(config, readObject(schemaPath));
	if (config == m["settings"].toObject())
		return get(id);
	snapshot(id, m);
	m["settings"] = config;
	commitProject(id, m);
	return get(id);
}
QStringList WidgetProjectService::files(const QString &id) const
{
	return sourceFiles(projectPath(id));
}
QByteArray WidgetProjectService::read(const QString &id, const QString &file) const
{
	if (!file.startsWith("src/") && !file.startsWith("assets/") && !file.startsWith("presets/") &&
	    file != "schema/settings.schema.json")
		throw DomainError("UNSAFE_PATH", "Only author files are accessible");
	return readFile(safePath(projectPath(id), file));
}
QJsonObject WidgetProjectService::write(const QString &id, const QString &file, const QByteArray &data,
					const QString &expected)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	if (data.size() > 8 * 1024 * 1024)
		throw DomainError("RESOURCE_LIMIT", "File exceeds limit");
	if (!file.startsWith("src/") && !file.startsWith("assets/") && !file.startsWith("presets/"))
		throw DomainError("UNSAFE_PATH", "Only project source/assets/presets are editable");
	const auto dest = safePath(projectPath(id), file);
	auto m = get(id);
	snapshot(id, m);
	atomicWrite(dest, data);
	commitProject(id, m);
	return get(id);
}
QJsonObject WidgetProjectService::fileOperation(const QString &id, const QString &op, const QString &file,
						const QString &other, const QString &expected)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	if (!file.startsWith("src/") && !file.startsWith("assets/"))
		throw DomainError("UNSAFE_PATH", "Only author files are editable");
	const auto path = safePath(projectPath(id), file);
	auto m = get(id);
	snapshot(id, m);
	bool ok = false;
	if (op == "mkdir")
		ok = QDir().mkpath(path);
	if (op == "remove")
		ok = QFile::remove(path);
	if (op == "rename") {
		if (!other.startsWith("src/") && !other.startsWith("assets/"))
			throw DomainError("UNSAFE_PATH", "Rename target outside author tree");
		ok = QFile::rename(path, safePath(projectPath(id), other));
	}
	if (!ok)
		throw DomainError("FILE_WRITE", "File operation failed");
	commitProject(id, m);
	return get(id);
}
QJsonObject WidgetProjectService::importAsset(const QString &id, const QString &external, const QString &as,
					      const QString &expected)
{
	if (!as.startsWith("assets/"))
		throw DomainError("UNSAFE_PATH", "Imports belong under assets/");
	if (!QFileInfo(external).isFile() || QFileInfo(external).isSymLink())
		throw DomainError("UNSAFE_PATH", "Import one regular file explicitly");
	return write(id, as, readFile(external), expected);
}
QJsonObject WidgetProjectService::validate(const QString &id) const
{
	if (get(id).contains("migrationError"))
		throw DomainError("MIGRATION_INCOMPLETE", get(id)["migrationError"].toString());
	const auto m = get(id);
	const auto path = projectPath(id);
	validateBuildMode(m["build"].toObject());
	const auto entry = m["entry"].toString();
	if (!entry.startsWith("src/") || !QFileInfo::exists(safePath(path, entry)))
		throw DomainError("MISSING_ENTRY", "Entry is missing");
	if (m["build"].toObject()["mode"] == "vite") {
		validateBuildMode(m["build"].toObject());
		if (m["entry"] != "src/index.html")
			throw DomainError("INVALID_BUILD", "Framework entry must be src/index.html");
		readObject(safePath(path, "src/package.json"));
		readObject(safePath(path, "src/package-lock.json"));
		for (const auto &file : files(id))
			if (file.endsWith(".css"))
				cssCheck(QString::fromUtf8(read(id, file)));
		return {{"valid", true},
			{"revision", m["revision"]},
			{"warnings",
			 QJsonArray{
				 "TypeScript syntax and compiled resources are checked by Build, not static Validate"}}};
	}
	const auto all = files(id);
	QSet<QString> portable;
	for (const auto &file : all) {
		if (portable.contains(file.toCaseFolded()))
			throw DomainError("UNSAFE_PATH", "Case-colliding author paths cannot be published portably");
		portable.insert(file.toCaseFolded());
	}
	const auto node = QStandardPaths::findExecutable("node");
	QJsonArray warnings;
	if (node.isEmpty())
		warnings.append(
			"Node unavailable: JavaScript syntax checking is skipped; source is never executed by the build.");
	const auto schemaPath = path + "/schema/settings.schema.json";
	if (QFileInfo::exists(schemaPath))
		validateSettings(m["settings"].toObject(), readObject(schemaPath));
	auto reference = [&](const QString &file, QString ref, bool module = false) {
		ref = ref.trimmed();
		if (ref.isEmpty() || ref.startsWith('#') || ref.startsWith("data:"))
			return;
		ref.replace("&amp;", "&");
		if (QStringList{"html", "htm"}.contains(QFileInfo(file).suffix().toLower())) {
			const auto base = htmlBaseHref(QString::fromUtf8(read(id, file)));
			if (!base.isEmpty())
				ref = QUrl(base).resolved(QUrl(ref)).toString();
		}
		const QUrl u(ref);
		if (!u.scheme().isEmpty()) {
			if (!QStringList{"http", "https", "file"}.contains(u.scheme()))
				throw DomainError("INVALID_PROTOCOL", "Unsupported resource protocol: " + ref);
			if (u.scheme() == "file" && !m["externalReferences"].toArray().contains(u.toLocalFile()))
				throw DomainError("UNSAFE_RESOURCE", "Explicit import required for local file: " + ref);
			return;
		}
		if (module && !ref.startsWith('.') && !ref.startsWith('/'))
			throw DomainError("UNRESOLVED_MODULE",
					  "Bare module imports require a precompiled package: " + ref);
		const auto relative =
			QDir::cleanPath(QFileInfo(file).path() + "/" + QUrl::fromPercentEncoding(u.path().toUtf8()));
		const auto resource = safePath(path, relative);
		if (!QFileInfo::exists(resource))
			throw DomainError("MISSING_ASSET", file + " references missing " + ref);
	};
	for (const auto &f : all) {
		const auto bytes = read(id, f);
		const auto text = QString::fromUtf8(bytes);
		const auto extension = QFileInfo(f).suffix().toLower();
		const auto lexical = codeMask(text, extension == "js" || extension == "mjs");
		if (extension == "html" || extension == "htm") {
			if (text.toUtf8() != bytes)
				throw DomainError("UNSUPPORTED_ENCODING",
						  "HTML must be UTF-8; source and previous output are unchanged");
			const auto base = htmlBaseHref(text);
			if (!base.isEmpty()) {
				const QUrl b(base);
				if (b.isRelative()) {
					const auto folder = QDir::cleanPath(QFileInfo(f).path() + "/" + b.path());
					safePath(path, folder.endsWith('/') ? folder.chopped(1) : folder);
				} else if (!QStringList{"https", "http"}.contains(b.scheme()))
					throw DomainError(
						"UNSAFE_RESOURCE",
						"Import local base assets into the project; external file bases are not published");
			}
			const auto elements = htmlElements(text);
			for (int tagIndex = 0; tagIndex < elements.size(); ++tagIndex) {
				const auto &tag = elements[tagIndex];
				if (tag.end == text.size() && !text.endsWith('>'))
					throw DomainError("HTML_SYNTAX", "Unclosed HTML tag");
				if (tag.name == "script" && !tag.closing && !tag.attributes.contains("src") &&
				    tagIndex + 1 < elements.size() && elements[tagIndex + 1].closing &&
				    elements[tagIndex + 1].name == "script" &&
				    !tag.attributes.value("type").contains("json")) {
					QTemporaryFile inlineScript(QDir::tempPath() + "/widget-inline-XXXXXX.mjs");
					if (!inlineScript.open())
						throw DomainError("FILE_WRITE", "Cannot validate inline script");
					inlineScript.write(
						text.mid(tag.end, elements[tagIndex + 1].start - tag.end).toUtf8());
					inlineScript.flush();
					syntaxCheck(inlineScript.fileName(), node);
				}
				if (tag.closing || tag.name == "base")
					continue;
				for (const auto &key : {"src", "href", "poster"})
					if (tag.attributes.contains(key)) {
						const auto ref = tag.attributes[key];
						reference(f, ref);
					}
				if (tag.attributes.contains("srcset"))
					for (const auto &candidate : tag.attributes["srcset"].split(','))
						reference(f, candidate.trimmed().section(' ', 0, 0));
			}
		} else if (extension == "css") {
			cssCheck(text);
			const QRegularExpression urls(
				R"css(url\(\s*['"]?([^'"\)]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"])css");
			auto it = urls.globalMatch(text);
			while (it.hasNext()) {
				const auto match = it.next();
				if (lexical[match.capturedStart()] != '1')
					continue;
				reference(f, match.captured(1).isEmpty() ? match.captured(2) : match.captured(1));
			}
		} else if (extension == "js" || extension == "mjs") {
			syntaxCheck(safePath(path, f), node);
			const QRegularExpression imports(R"js((?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"])js");
			auto it = imports.globalMatch(text);
			while (it.hasNext()) {
				const auto match = it.next();
				if (lexical[match.capturedStart()] == '1')
					reference(f, match.captured(1), true);
			}
		} else if (extension == "ts")
			throw DomainError("BUILD_TOOL_REQUIRED",
					  "Publish precompiled JavaScript; runtime builds do not compile TypeScript");
		const QRegularExpression maps(R"map(sourceMappingURL=([^\s*]+))map");
		auto mapsIt = maps.globalMatch(text);
		while (mapsIt.hasNext()) {
			const auto match = mapsIt.next();
			if (lexical[match.capturedStart()] == '2')
				reference(f, match.captured(1));
		}
	}
	const auto customCss = m["settings"].toObject()["customCss"].toString();
	const auto customLexical = codeMask(customCss, false);
	cssCheck(customCss);
	const QRegularExpression customUrls(R"css(url\(\s*['"]?([^'"\)]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"])css");
	auto customMatches = customUrls.globalMatch(customCss);
	while (customMatches.hasNext()) {
		const auto match = customMatches.next();
		if (customLexical[match.capturedStart()] != '1')
			continue;
		reference(entry, match.captured(1).isEmpty() ? match.captured(2) : match.captured(1));
	}
	const auto sound = m["settings"].toObject()["soundUrl"].toString();
	if (!sound.isEmpty())
		reference(entry, sound);
	return {{"valid", true},
		{"revision", m["revision"]},
		{"files", QJsonArray::fromStringList(all)},
		{"warnings", warnings}};
}
QJsonObject WidgetProjectService::buildUnlocked(const QString &id, bool publish)
{
	const auto before = get(id)["revision"].toString();
	const auto validation = validate(id);
	auto m = get(id);
	if (m["revision"].toString() != before)
		throw DomainError("REVISION_CONFLICT", "Source changed during validation");
	if (m["lastSourceHash"] != m["sourceHash"]) {
		snapshot(id, m);
		commitProject(id, m);
		m = get(id);
	}
	const auto token = m["revision"].toString();
	const auto runtime = safePath(root, "runtime/" + id);
	QDir().mkpath(runtime + "/cache");
	const auto buildId = QString::number(QDateTime::currentMSecsSinceEpoch()) + "-" +
			     QUuid::createUuid().toString(QUuid::WithoutBraces);
	QTemporaryDir staging(runtime + "/cache/build-XXXXXX");
	if (!staging.isValid())
		throw DomainError("FILE_WRITE", "Cannot stage build");
	for (const auto &f : files(id))
		atomicWrite(safePath(staging.path() + "/dist", f), read(id, f));
	auto entry = m["entry"].toString();
	if (builderProvider(m["build"].toObject())->id() != "static") {
		compileWidget(root, assets, staging.path() + "/dist", staging.path() + "/compiled",
			      m["build"].toObject(),
			      [this, id, token] { return get(id)["revision"].toString() != token; });
		// Validate compiled output using the same static validator in an isolated temporary service.
		QTemporaryDir check(runtime + "/cache/check-XXXXXX");
		WidgetProjectService compiled(check.path(), assets);
		auto cm = compiled.create("builtin.custom", "Compiled", {}, id);
		copyTree(staging.path() + "/compiled", compiled.projectPath(id) + "/src");
		if (QFileInfo::exists(staging.path() + "/dist/assets"))
			copyTree(staging.path() + "/dist/assets", compiled.projectPath(id) + "/assets");
		auto compiledSettings = m["settings"].toObject();
		for (const auto &key : {"id", "template", "customHtml", "editableHtml"})
			compiledSettings.remove(key);
		compiled.settings(id, compiledSettings, {});
		compiled.validate(id);
		QDir(staging.path() + "/dist").removeRecursively();
		copyTree(staging.path() + "/compiled", staging.path() + "/dist/src");
		if (QFileInfo::exists(compiled.projectPath(id) + "/assets"))
			copyTree(compiled.projectPath(id) + "/assets", staging.path() + "/dist/assets");
		entry = "src/index.html";
	}
	const auto release = runtime + "/releases/" + buildId;
	auto publicSettings = m["settings"].toObject();
	publicSettings["events"] = m["events"];
	const auto config = publicConfig(publicSettings);

	const auto bootstrap =
		"<script>window.TikTokWidgetConfig=" + QString::fromUtf8(config) +
		";Object.defineProperty(window,\"TikTokWidgetAssetBase\",{configurable:true,get:()=>new URL(\".\",document.baseURI).href});</script>";
	const auto original = readFile(staging.path() + "/dist/" + entry);
	QSet<QString> approvedScripts;
	const auto configHashes = m["legacyConfigHashes"].toObject();
	const auto base = htmlBaseHref(QString::fromUtf8(original));
	for (const auto &tag : htmlElements(QString::fromUtf8(original))) {
		if (tag.closing || tag.name != "script")
			continue;
		auto src = tag.attributes.value("src").section('?', 0, 0).section('#', 0, 0);
		const QUrl reference = QUrl(base).resolved(QUrl(src));
		if (!reference.isRelative() || src.isEmpty())
			continue;
		const auto relative = QDir::cleanPath(QFileInfo(entry).path() + "/" + reference.path());
		if (configHashes.contains(relative) && QFileInfo::exists(safePath(projectPath(id), relative)) &&
		    contentHash(projectPath(id), {relative}) == configHashes[relative].toString())
			approvedScripts.insert(src);
	}
	const bool replaceLegacyConfig = !approvedScripts.isEmpty();
	atomicWrite(staging.path() + "/dist/" + entry,
		    injectHtmlBootstrap(original, bootstrap, replaceLegacyConfig, approvedScripts));
	const auto previewBootstrap =
		bootstrap + "<script>window.TikTokWidgetBuildPointer=" + "new URL(" +
		jsonString(relativeUrl(release + "/dist/" + entry, runtime + "/build-pointer.js")) +
		",location.href).href" + ";window.TikTokWidgetBuildId=" + jsonString(buildId) +
		";</script><script src=\"" +
		relativeUrl(release + "/dist/" + entry, release + "/dist/.tiktok-preview/frame.js").toHtmlEscaped() +
		"\"></script>";
	atomicWrite(staging.path() + "/dist/.tiktok-preview/frame.js", readFile(assets + "/playground/frame.js"));
	const auto previewRelative = QFileInfo(entry).path() + "/preview.html";
	atomicWrite(staging.path() + "/dist/" + previewRelative,
		    injectHtmlBootstrap(original, previewBootstrap, replaceLegacyConfig, approvedScripts));
	atomicWrite(staging.path() + "/dist/runtime-config.json", config);
	QJsonObject build{{"schemaVersion", 2}, {"widgetId", id},
			  {"buildId", buildId}, {"revision", token},
			  {"entry", entry},     {"previewEntry", previewRelative},
			  {"release", release}, {"hash", contentHash(staging.path(), treeFiles(staging.path()))},
			  {"status", "built"},  {"warnings", validation["warnings"]}};
	writeObject(staging.path() + "/build-manifest.json", build);
	// Smoke test document shape and dependency checks performed above; Chromium/CEF is
	// deliberately not a runtime dependency. Optional syntax checks never run author JS.
	if (!readFile(staging.path() + "/dist/" + entry).contains("tiktok-bootstrap"))
		throw DomainError("SMOKE_TEST_FAILED", "Configuration bootstrap missing");
	if (get(id)["revision"].toString() != token)
		throw DomainError("REVISION_CONFLICT", "Source changed during build");
	QDir().mkpath(runtime + "/releases");
	if (!QDir().rename(staging.path(), release))
		throw DomainError("FILE_WRITE", "Cannot commit immutable release");
	staging.setAutoRemove(false);
	if (!publish) {
		writeObject(runtime + "/candidate.json", build);
		return build;
	}
	snapshot(id, m);
	build["buildRevision"] = QFileInfo::exists(runtime + "/build-manifest.json")
					 ? readObject(runtime + "/build-manifest.json")["buildRevision"].toInt() + 1
					 : 1;

	build["status"] = "published";
	// Prepare every ancillary file before the single serving-pointer commit.
	atomicWrite(safePath(root, "playground/" + id + "/preview.html"),
		    htmlLoader(outputPath(id), {}, true, {}, root + "/playground/" + id + "/preview.html").toUtf8());
	atomicWrite(runtime + "/dist/index.html",
		    htmlLoader(outputPath(id), {}, false, {}, runtime + "/dist/index.html").toUtf8());
	writeObject(runtime + "/candidate.json", build);
	atomicWrite(outputPath(id), htmlLoader(release + "/dist/" + entry, release + "/dist/" + previewRelative, false,
					       buildId, outputPath(id))
					    .toUtf8());
	// Commit has succeeded. Ancillary notification errors are warnings, not failed builds.
	try {
		writeObject(runtime + "/build-manifest.json", build);
		atomicWrite(runtime + "/build-pointer.js",
			    ("window.TikTokWidgetBuildChanged?.(" + jsonString(buildId) + ");").toUtf8());
	} catch (const DomainError &e) {
		auto warnings = build["warnings"].toArray();
		warnings.append(QString::fromUtf8(e.what()));
		build["warnings"] = warnings;
	}
	return build;
}
QJsonObject WidgetProjectService::build(const QString &id, const QString &expected, bool publish)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	return buildUnlocked(id, publish);
}
QJsonObject WidgetProjectService::checkpoint(const QString &id, const QString &expected)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	auto m = get(id);
	snapshot(id, m);
	return m;
}
QJsonArray WidgetProjectService::history(const QString &id) const
{
	QJsonArray a;
	const auto path = projectPath(id) + "/.history";
	for (const auto &folder : QDir(path).entryList(QDir::Dirs | QDir::NoDotAndDotDot, QDir::Name))
		a.append(QJsonObject{{"revision", folder}});
	return a;
}
QJsonObject WidgetProjectService::rollback(const QString &id, const QString &revision, const QString &expected)
{
	ProjectLock lock(root);
	checkRevision(id, expected);
	const auto snapshotPath = safePath(projectPath(id), ".history/" + revision);
	auto saved = readObject(snapshotPath + "/project.json");
	auto current = get(id);
	snapshot(id, current);
	// Explicit rollback is the only operation that restores author content. Keep removed
	// current files in the previous snapshot before applying the requested revision.
	for (const auto &f : sourceFiles(projectPath(id)))
		if (!QFileInfo::exists(safePath(snapshotPath, f)) && !QFile::remove(safePath(projectPath(id), f)))
			throw DomainError("FILE_WRITE", "Cannot restore project tree");
	for (const auto &f : sourceFiles(snapshotPath))
		atomicWrite(safePath(projectPath(id), f), readFile(safePath(snapshotPath, f)));
	saved["counter"] = current["counter"];
	commitProject(id, saved);
	return get(id);
}
QString WidgetProjectService::preview(const QString &id)
{
	const auto runtime = safePath(root, "runtime/" + id);
	if (!QFileInfo::exists(runtime + "/build-manifest.json"))
		build(id, {}, true);
	const auto dir = safePath(root, "playground/" + id);
	QDir().mkpath(dir);
	for (const auto &file : {"index.html", "app.js", "playground.css", "tokens.css", "frame.js"})
		atomicWrite(dir + "/" + file, readFile(assets + "/playground/" + file));
	atomicWrite(dir + "/preview.html",
		    htmlLoader(outputPath(id), {}, true, {}, root + "/playground/" + id + "/preview.html").toUtf8());
	return dir + "/index.html";
}
void WidgetProjectService::exportProject(const QString &id, const QString &output) const
{
	QTemporaryDir staging;
	const auto m = get(id);
	for (const auto &f : files(id))
		atomicWrite(safePath(staging.path(), f), read(id, f));
	if (QFileInfo::exists(projectPath(id) + "/schema"))
		copyTree(projectPath(id) + "/schema", staging.path() + "/schema");
	const auto ref = m["template"].toObject();
	const auto definition = templates.resolve(ref["id"].toString(), ref["version"].toString());
	copyTree(definition.root, staging.path() + "/template");
	writeObject(staging.path() + "/manifest.json", definition.value);
	writeObject(staging.path() + "/project.json", m);
	exportZip(staging.path(), output);
}
QJsonObject WidgetProjectService::importProject(const QString &archive, bool dry)
{
	QTemporaryDir staging;
	importZip(archive, staging.path());
	auto m = readObject(staging.path() + "/project.json");
	if (m["schemaVersion"].toInt() != 2)
		throw DomainError("INVALID_PROJECT", "Unsupported project schema");
	validateUuid(m["id"].toString());
	const auto templateRef = m["template"].toObject();
	bool needsTemplate = false;
	try {
		templates.resolve(templateRef["id"].toString(), templateRef["version"].toString());
	} catch (const DomainError &e) {
		if (e.code != "TEMPLATE_NOT_FOUND")
			throw;
		const auto embedded = TemplateRegistry::validate(staging.path() + "/template");
		if (embedded.id != templateRef["id"].toString() ||
		    embedded.version != templateRef["version"].toString())
			throw DomainError("VERSION_MISMATCH", "Embedded template identity mismatch");
		needsTemplate = true;
	}
	validateBuildMode(m["build"].toObject());
	const auto entry = m["entry"].toString();
	if (!entry.startsWith("src/") || !QFileInfo::exists(safePath(staging.path(), entry)))
		throw DomainError("MISSING_ENTRY", "Missing project entry");
	if (dry) {
		m["dryRun"] = true;
		m["idConflict"] = QFileInfo::exists(projectPath(m["id"].toString()));
		return m;
	}
	ProjectLock lock(root);
	if (needsTemplate) {
		const auto embedded = TemplateRegistry::validate(staging.path() + "/template");
		const auto destination = safePath(root, "templates/" + embedded.id + "/" + embedded.version);
		if (!QFileInfo::exists(destination))
			copyTree(embedded.root, destination);
		templates.discover();
	}
	auto id = m["id"].toString();
	if (QFileInfo::exists(projectPath(id)))
		id = QUuid::createUuid().toString(QUuid::WithoutBraces);
	for (const auto &f : sourceFiles(staging.path()))
		atomicWrite(safePath(projectPath(id), f), readFile(safePath(staging.path(), f)));
	if (QFileInfo::exists(staging.path() + "/schema"))
		copyTree(staging.path() + "/schema", projectPath(id) + "/schema");
	m["id"] = id;
	m["counter"] = 0;
	auto config = m["settings"].toObject();
	config["id"] = id;
	m["settings"] = config;
	commitProject(id, m);
	auto reg = registry();
	auto a = reg["widgets"].toArray();
	a.append(QJsonObject{{"id", id}});
	reg["widgets"] = a;
	writeObject(root + "/registry.json", reg);
	return get(id);
}
QJsonObject WidgetProjectService::migration(const QJsonArray &legacy, bool dry)
{
	QJsonArray report;
	for (const auto &v : legacy) {
		auto w = v.toObject();
		try {
			validateUuid(w["id"].toString());
			if (QFileInfo::exists(projectPath(w["id"].toString()) + "/project.json")) {
				report.append(QJsonObject{{"id", w["id"]}, {"status", "already-migrated"}});
				continue;
			}
			templates.resolve(w["template"].toString());
			report.append(QJsonObject{{"id", w["id"]},
						  {"status", "can-migrate"},
						  {"externalSource", w["editableHtml"].toString().isEmpty()
									     ? w["customHtml"]
									     : w["editableHtml"]}});
		} catch (const DomainError &e) {
			report.append(QJsonObject{{"id", w["id"]},
						  {"status", "preserved-with-error"},
						  {"error", failure(e)["error"]}});
		}
	}
	if (dry)
		return {{"schemaVersion", 2}, {"dryRun", true}, {"items", report}};
	const auto backup = safePath(root, "cache/migration-v1");
	if (!QFileInfo::exists(backup + "/widgets.json")) {
		if (QFileInfo::exists(root + "/widgets.json"))
			atomicWrite(backup + "/widgets.json", readFile(root + "/widgets.json"));
		else
			atomicWrite(backup + "/widgets.json", QJsonDocument(legacy).toJson());
		if (QFileInfo::exists(root + "/widgets"))
			copyTree(root + "/widgets", backup + "/widgets");
		if (QFileInfo::exists(root + "/registry.json"))
			atomicWrite(backup + "/registry.json", readFile(root + "/registry.json"));
	}
	for (int i = 0; i < legacy.size(); ++i) {
		const auto w = legacy[i].toObject();
		const auto id = w["id"].toString();
		if (report[i].toObject()["status"] != "can-migrate")
			continue;
		try {
			QTemporaryDir importedStage;
			if (!importedStage.isValid())
				throw DomainError("FILE_WRITE", "Cannot stage legacy resources");
			QJsonObject importedMetadata;
			auto &m = importedMetadata;
			m["settings"] = w;
			m["migrationVersion"] = 1;
			QString original = w["editableHtml"].toString();
			if (original.isEmpty())
				original = w["customHtml"].toString();
			if (original.isEmpty() && QFileInfo::exists(outputPath(id)))
				original = outputPath(id);
			if (!original.isEmpty()) {
				if (!QFileInfo(original).isFile() || QFileInfo(original).isSymLink())
					throw DomainError("MISSING_ENTRY", "Legacy author file unavailable");
				const auto externalRoot = QFileInfo(original).absolutePath();
				const auto entry = QFileInfo(original).fileName();
				QStringList pending{entry};
				QSet<QString> imported;
				QJsonArray externalRefs;
				const QUrl legacySound(w["soundUrl"].toString());
				if (!legacySound.isEmpty()) {
					if (legacySound.isRelative())
						pending << QDir::cleanPath(legacySound.path());
					else if (legacySound.scheme() == "file")
						externalRefs.append(legacySound.toLocalFile());
				}
				while (!pending.isEmpty()) {
					const auto f = pending.takeFirst();
					if (imported.contains(f))
						continue;
					imported.insert(f);
					if (imported.size() > 2048)
						throw DomainError("RESOURCE_LIMIT", "Legacy resource graph too large");
					const auto bytes = readFile(safePath(externalRoot, f));
					if (QFileInfo(f).fileName() == "config.js") {
						auto configuration = bytes.trimmed();
						const QByteArray prefix = "window.TikTokWidgetConfig=";
						if (configuration.startsWith(prefix) && configuration.endsWith(';')) {
							configuration = configuration.mid(prefix.size());
							configuration.chop(1);
							QJsonParseError error;
							const auto parsed =
								QJsonDocument::fromJson(configuration, &error);
							if (error.error == QJsonParseError::NoError &&
							    parsed.isObject()) {
								m["legacyGeneratedConfig"] = true;
								auto hashes = m["legacyConfigHashes"].toObject();
								QCryptographicHash hash(QCryptographicHash::Sha256);
								hash.addData(("src/" + f).toUtf8());
								hash.addData(QByteArray(1, '\0'));
								hash.addData(bytes);
								hashes["src/" + f] =
									QString::fromLatin1(hash.result().toHex());
								m["legacyConfigHashes"] = hashes;
								auto settings = m["settings"].toObject();
								const auto values = parsed.object();
								for (auto it = values.begin(); it != values.end(); ++it)
									if (it.key() != "id" && it.key() != "template")
										settings[it.key()] = it.value();
								m["settings"] = settings;
							}
						}
					}
					atomicWrite(safePath(backup, "external/" + id + "/" + f), bytes);
					atomicWrite(safePath(importedStage.path(), "src/" + f), bytes);
					QStringList refs;
					const auto text = QString::fromUtf8(bytes), ext = QFileInfo(f).suffix();
					if (ext == "html" || ext == "htm")
						for (const auto &tag : htmlElements(text)) {
							if (tag.name == "base")
								continue;
							for (const auto &key : {"src", "href", "poster"})
								if (tag.attributes.contains(key))
									refs << tag.attributes[key];
							if (tag.attributes.contains("srcset"))
								for (const auto &c :
								     tag.attributes["srcset"].split(','))
									refs << c.trimmed().section(' ', 0, 0);
						}
					auto resourceMask = codeMask(text, ext == "js" || ext == "mjs");
					if (ext == "html" || ext == "htm") {
						resourceMask.fill('0');
						const auto tags = htmlElements(text);
						for (int index = 0; index + 1 < tags.size(); ++index) {
							const auto &tag = tags[index];
							if (!tag.closing &&
							    (tag.name == "script" || tag.name == "style") &&
							    tags[index + 1].closing &&
							    tags[index + 1].name == tag.name) {
								const auto segment = codeMask(
									text.mid(tag.end,
										 tags[index + 1].start - tag.end),
									tag.name == "script");
								for (int offset = 0; offset < segment.size(); ++offset)
									resourceMask[tag.end + offset] =
										segment[offset];
							}
						}
					}
					const QRegularExpression resources(
						R"r(url\(\s*['"]?([^'"\)]+)['"]?\s*\)|(?:@import\s*|\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"])r");
					auto it = resources.globalMatch(text);
					while (it.hasNext()) {
						const auto r = it.next();
						if (resourceMask[r.capturedStart()] != '1')
							continue;
						refs << (r.captured(1).isEmpty() ? r.captured(2) : r.captured(1));
					}
					for (const auto &r : refs) {
						QUrl url(r);
						if (ext == "html" || ext == "htm") {
							const auto base = htmlBaseHref(text);
							if (!base.isEmpty())
								url = QUrl(base).resolved(url);
						}
						if (r.isEmpty() || r.startsWith('#') || !url.scheme().isEmpty()) {
							if (url.scheme() == "file")
								externalRefs.append(url.toLocalFile());
							continue;
						}
						const auto rel =
							QDir::cleanPath(QFileInfo(f).path() + "/" + url.path());
						safePath(externalRoot, rel);
						if (QFileInfo::exists(externalRoot + "/" + rel))
							pending << rel;
						else if (rel != "config.js")
							throw DomainError("MISSING_ASSET",
									  "Legacy resource missing: " + rel);
					}
				}
				m["entry"] = "src/" + entry;
				m["legacySource"] = original;
				m["externalReferences"] = externalRefs;
			}
			auto initialized = create(w["template"].toString(), w["name"].toString(), {}, id);
			ProjectLock lock(root);
			for (auto it = m.begin(); it != m.end(); ++it)
				initialized[it.key()] = it.value();
			if (QFileInfo::exists(importedStage.path() + "/src"))
				copyTree(importedStage.path() + "/src", projectPath(id) + "/src");
			commitProject(id, initialized);
		} catch (const DomainError &e) {
			if (QFileInfo::exists(projectPath(id) + "/project.json")) {
				auto partial = readObject(projectPath(id) + "/project.json");
				partial["migrationError"] = QString::fromUtf8(e.what());
				partial["autoPublish"] = false;
				partial["settings"] = w;
				writeObject(projectPath(id) + "/project.json", partial);
			}
			auto r = report[i].toObject();
			r["status"] = "preserved-with-error";
			r["error"] = failure(e)["error"];
			report[i] = r;
		}
	}
	auto reg = registry();
	reg["migrationVersion"] = 1;
	reg["migrationRolledBack"] = false;
	reg["legacyRecords"] = legacy;
	writeObject(root + "/registry.json", reg);
	writeObject(backup + "/report.json", {{"items", report}});
	return {{"schemaVersion", 2}, {"dryRun", false}, {"backup", backup}, {"items", report}};
}
QJsonObject WidgetProjectService::restoreMigration(bool dry)
{
	const auto backup = safePath(root, "cache/migration-v1");
	if (!QFileInfo::exists(backup + "/widgets.json"))
		throw DomainError("BACKUP_NOT_FOUND", "No migration backup");
	if (dry)
		return {{"dryRun", true}, {"backup", backup}};
	ProjectLock lock(root);
	atomicWrite(root + "/widgets.json", readFile(backup + "/widgets.json"));
	if (QFileInfo::exists(backup + "/widgets"))
		copyTree(backup + "/widgets", root + "/widgets");
	auto reg = registry();
	reg["migrationRolledBack"] = true;
	writeObject(root + "/registry.json", reg);
	return {{"restored", true}, {"projectsRetained", true}};
}
} // namespace tt
