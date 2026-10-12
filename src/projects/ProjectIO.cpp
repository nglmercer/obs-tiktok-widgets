#include "ProjectIO.hpp"
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QSaveFile>
#include <QJsonDocument>
#include <QCryptographicHash>
#include <QRegularExpression>
#include <QUuid>
namespace tt {
DomainError::DomainError(QString c, QString m, QJsonObject d)
	: std::runtime_error(m.toStdString()),
	  code(std::move(c)),
	  details(std::move(d))
{
}
QByteArray readFile(const QString &path, qint64 limit)
{
	QFile f(path);
	if (!f.open(QIODevice::ReadOnly))
		throw DomainError("FILE_READ", "Cannot read " + path);
	if (f.size() > limit)
		throw DomainError("RESOURCE_LIMIT", "File exceeds size limit: " + path);
	return f.readAll();
}
void atomicWrite(const QString &path, const QByteArray &bytes)
{
	if (QFileInfo(path).isSymLink())
		throw DomainError("UNSAFE_PATH", "Symlink destination: " + path);
	if (!QDir().mkpath(QFileInfo(path).absolutePath()))
		throw DomainError("FILE_WRITE", "Cannot create parent directory");
	QSaveFile f(path);
	if (!f.open(QIODevice::WriteOnly) || f.write(bytes) != bytes.size() || !f.commit())
		throw DomainError("FILE_WRITE", "Cannot commit " + path);
}
QJsonObject readObject(const QString &path)
{
	QJsonParseError e;
	auto doc = QJsonDocument::fromJson(readFile(path), &e);
	if (e.error != QJsonParseError::NoError || !doc.isObject())
		throw DomainError("INVALID_JSON", "Invalid JSON object: " + path);
	return doc.object();
}
void writeObject(const QString &path, const QJsonObject &o)
{
	atomicWrite(path, QJsonDocument(o).toJson());
}
QString safePath(const QString &root, const QString &relative)
{
	if (relative.isEmpty() || relative.contains('\\') || relative.contains(':') || relative.startsWith('/') ||
	    relative.contains(QChar(0)) || relative.size() > 512)
		throw DomainError("UNSAFE_PATH", "Invalid relative path: " + relative);
	for (const auto &part : relative.split('/'))
		if (part.isEmpty() || part == "." || part == ".." || part.endsWith('.') || part.endsWith(' ') ||
		    QRegularExpression("^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\.|$)",
				       QRegularExpression::CaseInsensitiveOption)
			    .match(part)
			    .hasMatch() ||
		    part.contains(QRegularExpression("[<>\"|?*]")))
			throw DomainError("UNSAFE_PATH", "Nonportable path: " + relative);
	const auto base = QFileInfo(root).absoluteFilePath();
	QString current = base;
	// Reject symlinks in every existing ancestor, including a configured root.
	for (QString ancestor = base; !ancestor.isEmpty();) {
		if (QFileInfo(ancestor).isSymLink())
			throw DomainError("UNSAFE_PATH", "Symlink ancestor");
		const auto parent = QFileInfo(ancestor).absolutePath();
		if (parent == ancestor)
			break;
		ancestor = parent;
	}
	for (const auto &part : relative.split('/')) {
		current += '/' + part;
		if (QFileInfo(current).isSymLink())
			throw DomainError("UNSAFE_PATH", "Symlink path: " + relative);
	}
	return current;
}
QStringList treeFiles(const QString &root)
{
	QStringList files;
	qint64 total = 0;
	QDirIterator it(root, QDir::Files | QDir::Dirs | QDir::NoDotAndDotDot | QDir::Hidden,
			QDirIterator::Subdirectories);
	while (it.hasNext()) {
		it.next();
		const auto info = it.fileInfo();
		const auto rel = QDir(root).relativeFilePath(info.absoluteFilePath());
		safePath(root, rel);
		if (info.isFile()) {
			if (info.size() > 8 * 1024 * 1024 || (total += info.size()) > 64 * 1024 * 1024 ||
			    files.size() >= 2048)
				throw DomainError("RESOURCE_LIMIT", "Project exceeds limits");
			files << rel;
		}
	}
	files.sort();
	return files;
}
QString contentHash(const QString &root, const QStringList &files)
{
	QCryptographicHash h(QCryptographicHash::Sha256);
	for (const auto &f : files) {
		h.addData(f.toUtf8());
		h.addData(QByteArray(1, '\0'));
		h.addData(readFile(safePath(root, f)));
	}
	return QString::fromLatin1(h.result().toHex());
}
void copyTree(const QString &from, const QString &to)
{
	for (const auto &f : treeFiles(from))
		atomicWrite(safePath(to, f), readFile(safePath(from, f)));
}
void validateUuid(const QString &id)
{
	if (!QRegularExpression("^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$").match(id).hasMatch() ||
	    QUuid(id).isNull())
		throw DomainError("INVALID_ID", "Expected canonical widget UUID");
}
QString jsonString(const QString &s)
{
	auto bytes = QJsonDocument(QJsonArray{s}).toJson(QJsonDocument::Compact);
	bytes.replace("<", "\\u003c");
	bytes.replace(">", "\\u003e");
	bytes.replace("&", "\\u0026");
	return QString::fromUtf8(bytes.mid(1, bytes.size() - 2));
}
static QJsonValue publicValue(const QJsonValue &value)
{
	if (value.isArray()) {
		QJsonArray array;
		for (const auto &v : value.toArray())
			array.append(publicValue(v));
		return array;
	}
	if (!value.isObject())
		return value;
	QJsonObject object;
	const auto original = value.toObject();
	for (auto it = original.begin(); it != original.end(); ++it)
		if (!QRegularExpression("cookie|session|secret|credential|signing|token|customHtml|editableHtml",
					QRegularExpression::CaseInsensitiveOption)
			     .match(it.key())
			     .hasMatch())
			object[it.key()] = publicValue(it.value());
	return object;
}
QByteArray publicConfig(const QJsonObject &value)
{
	auto b = QJsonDocument(publicValue(value).toObject()).toJson(QJsonDocument::Compact);
	b.replace("<", "\\u003c");
	b.replace(">", "\\u003e");
	b.replace("&", "\\u0026");
	return b;
}
ProjectLock::ProjectLock(const QString &root) : lock(safePath(root, "registry.lock"))
{
	QDir().mkpath(root);
	lock.setStaleLockTime(30000);
	if (!lock.tryLock(2000))
		throw DomainError("BUSY", "Another writer holds the project lock");
}
QJsonObject success(const QJsonValue &data, const QJsonArray &warnings)
{
	return {{"apiVersion", 1}, {"ok", true}, {"data", data}, {"warnings", warnings}};
}
QJsonObject failure(const DomainError &e)
{
	return {{"apiVersion", 1},
		{"ok", false},
		{"error",
		 QJsonObject{{"code", e.code}, {"message", QString::fromUtf8(e.what())}, {"details", e.details}}}};
}
} // namespace tt
