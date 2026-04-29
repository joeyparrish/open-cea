CC = gcc
CFLAGS = -Wall -Wextra -I./libcaption
LDFLAGS = -L./libcaption -lcaption

all: libcaption/libcaption.a generator

libcaption/libcaption.a:
	./build-lib.sh

generator: generator.c libcaption/libcaption.a
	$(CC) $(CFLAGS) -o generator generator.c $(LDFLAGS)

clean:
	rm -f generator
