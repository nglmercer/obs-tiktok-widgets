#pragma once
#include "WidgetProjectService.hpp"
#include <QObject>
#include <QFileSystemWatcher>
#include <QTimer>
#include <QThreadPool>
#include <QSet>
namespace tt {
class WidgetProjectWatcher : public QObject {
	Q_OBJECT
	WidgetProjectService &service;
	QFileSystemWatcher watcher;
	QTimer poll;
	QMap<QString, QString> observed, published;
	QMap<QString, qint64> dirty;
	int debounce = 350;
	QThreadPool pool;
	QSet<QString> building;
	void scan();
	void scanSafely();
	void reconcile();

public:
	WidgetProjectWatcher(WidgetProjectService &, QObject *parent = nullptr);
	void setDebounce(int ms);
	~WidgetProjectWatcher() override;
signals:
	void stateChanged(QString id, QString state, QString diagnostic);
	void publishedWidget(QString id);
};
} // namespace tt
