#pragma once
#include "projects/WidgetCommands.hpp"
#include <QTcpServer>
namespace tt {
class StudioServer : public QTcpServer {
	WidgetProjectService &service;
	WidgetCommands commands;
	QString assetRoot, token, origin;
	QStringList allowed;
	void receive(QTcpSocket *);

public:
	StudioServer(WidgetProjectService &, QString assets, QObject *parent = nullptr);
	QString start();
};
} // namespace tt
