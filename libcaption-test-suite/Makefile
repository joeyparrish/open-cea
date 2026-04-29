CXX = g++
CXXFLAGS = -Wall -Wextra -I./libcaption
LDFLAGS = -L./libcaption -lcaption

all: libcaption/libcaption.a generator

libcaption/libcaption.a:
	./build-lib.sh

generator: generator.cpp libcaption/libcaption.a
	$(CXX) $(CXXFLAGS) -o generator generator.cpp $(LDFLAGS)

clean:
	rm -f generator
