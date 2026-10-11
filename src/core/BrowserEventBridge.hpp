#pragma once
#include <QJsonObject>
#include <QString>
namespace tt {
class BrowserEventBridge {
	QString error;

public:
	bool verify();
	bool emitEvent(const QString &, const QJsonObject &);
	bool broadcast(const QJsonObject &);
	QString lastError() const { return error; }
};
} // namespace tt
