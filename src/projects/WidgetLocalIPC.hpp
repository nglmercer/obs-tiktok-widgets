#pragma once
#include "WidgetCommands.hpp"
#include <QObject>
#include <QLocalServer>
#include <QMap>
namespace tt {
class WidgetLocalIPC : public QObject {
	Q_OBJECT
	WidgetCommands &commands;
	QString root, token;
	QLocalServer server;
	qint64 interval = 0;
	int count = 0;

public:
	WidgetLocalIPC(WidgetCommands &, QString root, QObject *parent = nullptr);
	~WidgetLocalIPC() override;
	bool start(bool enabled);
	void stop();
	bool enabled() const { return server.isListening(); }
};
} // namespace tt
