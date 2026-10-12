#pragma once
#include <QJsonObject>
#include <QJsonArray>
#include <QStringList>
#include <QLockFile>
#include <stdexcept>
namespace tt {
struct DomainError : std::runtime_error {
	QString code;
	QJsonObject details;
	DomainError(QString code, QString message, QJsonObject details = {});
};
QByteArray readFile(const QString &path, qint64 limit = 8 * 1024 * 1024);
void atomicWrite(const QString &path, const QByteArray &data);
QJsonObject readObject(const QString &path);
void writeObject(const QString &path, const QJsonObject &object);
QString safePath(const QString &root, const QString &relative);
QStringList treeFiles(const QString &root);
QString contentHash(const QString &root, const QStringList &files);
void copyTree(const QString &source, const QString &destination);
void validateUuid(const QString &id);
QString jsonString(const QString &value);
QByteArray publicConfig(const QJsonObject &value);
class ProjectLock {
	QLockFile lock;

public:
	explicit ProjectLock(const QString &root);
};
QJsonObject success(const QJsonValue &data = QJsonObject{}, const QJsonArray &warnings = {});
QJsonObject failure(const DomainError &error);
} // namespace tt
